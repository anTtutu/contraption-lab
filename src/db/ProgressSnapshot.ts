/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ProgressSnapshot.ts
 * -----------------------------------------------------------------------------
 * 用途: 同步进度适配器 —— 场景层的 ProgressStore 接口保持同步签名（零改动），
 *       内部持有启动时预加载的快照；写入时先更新快照再异步穿写 SQLite。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { ProgressStore, LevelProgress } from '../level/ProgressStore';
import type { GameRepository } from './repository';

export class ProgressSnapshot implements ProgressStore {
  constructor(
    private readonly repo: GameRepository,
    private readonly snapshot: Map<string, LevelProgress>,
  ) {}

  get(levelId: string): LevelProgress | null {
    return this.snapshot.get(levelId) ?? null;
  }

  all(): Map<string, LevelProgress> {
    return this.snapshot;
  }

  recordClear(levelId: string, stars: number, partsUsed: number, usedHint: boolean): void {
    // 1) 同步更新快照（本会话内立即生效，与 Memory 实现语义一致）
    const prev = this.snapshot.get(levelId);
    this.snapshot.set(levelId, {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestParts: Math.min(prev?.bestParts ?? Number.MAX_SAFE_INTEGER, partsUsed),
      usedHint: (prev?.usedHint ?? true) && usedHint,
    });
    // 2) 异步穿写数据库（失败仅告警：快照仍保证本会话正确）
    this.repo.recordClear(levelId, stars, partsUsed, usedHint).catch((err) => {
      console.warn('[ProgressSnapshot] 进度写库失败:', err);
    });
  }
}
