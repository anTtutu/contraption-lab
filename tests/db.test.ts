/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: db.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 数据层 DAO 单测 —— Node 直连真实 SQLite（内存库）驱动 GameRepository：
 *       建表幂等 / 种子导入水位 / 进度 UPSERT 取优 / 用户关卡 CRUD / 机关 CRUD / 设置
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect, beforeAll } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { GameRepository, SEED_VERSION } from '../src/db/repository';

/** Node 端 SqlExecutor：直连官方 wasm 内存库（与 Worker 内同一套 API） */
async function createNodeExecutor() {
  const sqlite3 = (await sqlite3InitModule()) as unknown as {
    oo1: { DB: new (name: string, flags?: string) => {
      exec(options: { sql: string; bind?: unknown[]; rowMode?: string; callback?: (row: unknown) => void }): void;
    } };
  };
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  return {
    async exec(sql: string, bind?: unknown[]): Promise<void> {
      db.exec({ sql, bind: bind as never });
    },
    async select<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      const rows: T[] = [];
      db.exec({ sql, bind: bind as never, rowMode: 'object', callback: (row) => rows.push(row as T) });
      return rows;
    },
  };
}

let repo: GameRepository;

beforeAll(async () => {
  repo = new GameRepository(await createNodeExecutor());
  await repo.createTables();
});

describe('GameRepository 数据仓库', () => {
  it('建表幂等：重复建表不报错', async () => {
    await expect(repo.createTables()).resolves.toBeUndefined();
  });

  it('种子导入：官方关卡全部入库且幂等（重复导入不翻倍）', async () => {
    await repo.seedOfficial();
    const first = (await repo.query<{ n: number }>("SELECT COUNT(*) AS n FROM levels WHERE source = 'official'"))[0].n;
    await repo.seedOfficial();
    const second = (await repo.query<{ n: number }>("SELECT COUNT(*) AS n FROM levels WHERE source = 'official'"))[0].n;
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it('进度记录：首次写入，重复记录按「星取大/道具取小/提示位取与」合并', async () => {
    await repo.recordClear('LX-01', 1, 5, true);
    let p = await repo.getProgress('LX-01');
    expect(p).toEqual({ stars: 1, bestParts: 5, usedHint: true });

    await repo.recordClear('LX-01', 3, 3, false);
    p = await repo.getProgress('LX-01');
    expect(p).toEqual({ stars: 3, bestParts: 3, usedHint: false });

    // 星取大：再来一次 1 星不能降级
    await repo.recordClear('LX-01', 1, 4, true);
    p = await repo.getProgress('LX-01');
    expect(p?.stars).toBe(3);
    expect(p?.bestParts).toBe(3);
  });

  it('进度地图：loadProgressMap 覆盖全部已记录关卡', async () => {
    const map = await repo.loadProgressMap();
    expect(map.get('LX-01')?.stars).toBe(3);
  });

  it('用户关卡：保存/列出/删除（官方关不可删）', async () => {
    const doc = {
      version: 2,
      id: 'u-test1',
      source: 'user' as const,
      name: '测试关',
      chapter: 0,
      scene: { width: 1280, height: 720 },
      fixed: [],
      inventory: [{ type: 'plank', count: 2 }],
      goals: [],
      starRule: { maxParts: 2 },
      hints: { text: 'x' },
      meta: { verified: false },
    };
    await repo.saveUserLevel(doc);
    let list = await repo.listUserLevels();
    expect(list.some((d) => d.id === 'u-test1')).toBe(true);

    doc.name = '测试关改名';
    await repo.saveUserLevel(doc);
    list = await repo.listUserLevels();
    expect(list.find((d) => d.id === 'u-test1')?.name).toBe('测试关改名');

    await repo.deleteUserLevel('u-test1');
    list = await repo.listUserLevels();
    expect(list.some((d) => d.id === 'u-test1')).toBe(false);

    // 官方关删除应无效
    await repo.deleteUserLevel('L1-01');
    const officials = (await repo.query<{ n: number }>("SELECT COUNT(*) AS n FROM levels WHERE id = 'L1-01'"))[0].n;
    expect(officials).toBe(1);
  });

  it('沙盒机关：保存/列出/删除', async () => {
    await repo.saveMachine('m1', '我的机关A', '{"props":[]}');
    const list = await repo.listMachines();
    expect(list.find((m) => m.id === 'm1')?.name).toBe('我的机关A');
    await repo.deleteMachine('m1');
    expect((await repo.listMachines()).find((m) => m.id === 'm1')).toBeUndefined();
  });

  it('设置：写入与覆盖', async () => {
    await repo.setSetting('sound', 'on');
    expect(await repo.getSetting('sound')).toBe('on');
    await repo.setSetting('sound', 'off');
    expect(await repo.getSetting('sound')).toBe('off');
  });

  it('种子水位记录在 meta 表', async () => {
    const rows = await repo.query<{ v: string }>("SELECT value AS v FROM meta WHERE key = 'seed_version'");
    expect(rows[0]?.v).toBe(SEED_VERSION);
  });
});
