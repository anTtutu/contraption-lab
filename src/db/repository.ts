/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: repository.ts
 * -----------------------------------------------------------------------------
 * 用途: 游戏数据仓库（DAO 层，设计文档 §11.2/§11.3）
 *       - 表：meta / settings / progress / levels / sandbox_machines
 *       - 官方关卡种子导入（幂等，按 seed_version 水位）
 *       - 依赖注入 SqlExecutor：生产=DbService(Worker)，测试=Node 直连 SQLite
 *       - onWrite 钩子：内存模式下外层挂「防抖 IndexedDB 备份」
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { SqlExecutor } from './DbService';
import type { LevelProgress } from '../level/ProgressStore';
import type { LevelDoc } from '../level/types';
import { ALL_LEVELS } from '../level/levelIndex';

/** 当前 schema 版本（迁移链起点） */
export const SCHEMA_VERSION = 1;
/** 官方关卡种子水位：关卡内容更新时递增，触发重播种 */
export const SEED_VERSION = '1';

/** 进度行（select 返回形态） */
interface ProgressRow {
  level_id: string;
  stars: number;
  best_parts: number | null;
  used_hint: number;
}

export class GameRepository {
  /** 写操作后的回调（内存模式挂 IndexedDB 防抖备份） */
  onWrite: (() => void) | null = null;

  constructor(private readonly db: SqlExecutor) {}

  /** 建表（幂等，§11.2 Schema v1） */
  async createTables(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS progress(
        level_id TEXT PRIMARY KEY,
        stars INTEGER DEFAULT 0,
        best_parts INTEGER,
        used_hint INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        cleared_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS levels(
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('official','user')),
        name TEXT NOT NULL,
        chapter INTEGER,
        data TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_played_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_levels_source ON levels(source, chapter);
      CREATE TABLE IF NOT EXISTS sandbox_machines(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /** 官方关卡种子导入（幂等：seed_version 水位未变则跳过；进度按 level_id 关联不受影响） */
  async seedOfficial(): Promise<void> {
    const rows = await this.db.select<{ v: string }>("SELECT value AS v FROM meta WHERE key = 'seed_version'");
    if (rows.length > 0 && rows[0].v === SEED_VERSION) return;

    const now = new Date().toISOString();
    for (const doc of ALL_LEVELS) {
      await this.db.exec(
        `INSERT INTO levels(id, source, name, chapter, data, verified, created_at, updated_at)
         VALUES(?, 'official', ?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, name = excluded.name, updated_at = excluded.updated_at`,
        [doc.id, doc.name, doc.chapter, JSON.stringify(doc), now, now],
      );
    }
    await this.db.exec(
      `INSERT INTO meta(key, value) VALUES('seed_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SEED_VERSION],
    );
    this.notifyWrite();
  }

  // ---- 闯关进度 ----

  /** 读取单关进度 */
  async getProgress(levelId: string): Promise<LevelProgress | null> {
    const rows = await this.db.select<ProgressRow>('SELECT * FROM progress WHERE level_id = ?', [levelId]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return { stars: row.stars, bestParts: row.best_parts ?? 0, usedHint: row.used_hint === 1 };
  }

  /** 全部进度（关卡地图渲染用） */
  async loadProgressMap(): Promise<Map<string, LevelProgress>> {
    const rows = await this.db.select<ProgressRow>('SELECT * FROM progress');
    const map = new Map<string, LevelProgress>();
    for (const row of rows) {
      map.set(row.level_id, { stars: row.stars, bestParts: row.best_parts ?? 0, usedHint: row.used_hint === 1 });
    }
    return map;
  }

  /** 记录一次通关（只保留更优：星取大、道具取小、提示位取与） */
  async recordClear(levelId: string, stars: number, partsUsed: number, usedHint: boolean): Promise<void> {
    const prev = await this.getProgress(levelId);
    const now = new Date().toISOString();
    const next = {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestParts: Math.min(prev?.bestParts ?? Number.MAX_SAFE_INTEGER, partsUsed),
      usedHint: (prev?.usedHint ?? true) && usedHint,
    };
    await this.db.exec(
      `INSERT INTO progress(level_id, stars, best_parts, used_hint, attempts, cleared_at, updated_at)
       VALUES(?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(level_id) DO UPDATE SET
         stars = excluded.stars, best_parts = excluded.best_parts, used_hint = excluded.used_hint,
         attempts = attempts + 1, updated_at = excluded.updated_at`,
      [levelId, next.stars, next.bestParts, next.usedHint ? 1 : 0, now, now],
    );
    this.notifyWrite();
  }

  // ---- 用户自定义关卡（编辑器产出，步骤 6 使用） ----

  /** 保存/更新用户关卡 */
  async saveUserLevel(doc: LevelDoc): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO levels(id, source, name, chapter, data, verified, created_at, updated_at)
       VALUES(?, 'user', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, data = excluded.data, verified = excluded.verified, updated_at = excluded.updated_at`,
      [doc.id, doc.name, doc.chapter, JSON.stringify(doc), doc.meta?.verified ? 1 : 0, now, now],
    );
    this.notifyWrite();
  }

  /** 全部用户关卡 */
  async listUserLevels(): Promise<LevelDoc[]> {
    const rows = await this.db.select<{ data: string }>("SELECT data FROM levels WHERE source = 'user' ORDER BY updated_at DESC");
    return rows.map((r) => JSON.parse(r.data) as LevelDoc);
  }

  /** 删除用户关卡（官方关不可删） */
  async deleteUserLevel(id: string): Promise<void> {
    await this.db.exec("DELETE FROM levels WHERE id = ? AND source = 'user'", [id]);
    this.notifyWrite();
  }

  // ---- 沙盒「我的机关」 ----

  /** 保存机关（返回 ID） */
  async saveMachine(id: string, name: string, data: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO sandbox_machines(id, name, data, updated_at) VALUES(?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
      [id, name, data, now],
    );
    this.notifyWrite();
  }

  /** 全部机关（新→旧） */
  async listMachines(): Promise<Array<{ id: string; name: string; data: string }>> {
    return this.db.select('SELECT id, name, data FROM sandbox_machines ORDER BY updated_at DESC');
  }

  /** 删除机关 */
  async deleteMachine(id: string): Promise<void> {
    await this.db.exec('DELETE FROM sandbox_machines WHERE id = ?', [id]);
    this.notifyWrite();
  }

  // ---- 设置 ----

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.exec(
      'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
    this.notifyWrite();
  }

  /** 写后通知（防抖备份钩子） */
  private notifyWrite(): void {
    this.onWrite?.();
  }

  /** 通用查询（仅供测试与调试工具使用，业务数据访问请走上方具名方法） */
  query<T>(sql: string): Promise<T[]> {
    return this.db.select<T>(sql);
  }
}
