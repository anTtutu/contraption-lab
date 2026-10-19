/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ProgressStore.ts
 * -----------------------------------------------------------------------------
 * 用途: 闯关进度存储接口 + 内存实现（步骤 4 过渡用）
 *       步骤 5 将提供 SQLite 实现（OPFS 持久化，§11），本接口保持不变——
 *       场景层只依赖接口，换存储零改动。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 单关进度记录 */
export interface LevelProgress {
  /** 最高星数 0-3 */
  stars: number;
  /** 历史最少道具数 */
  bestParts: number;
  /** 是否用过提示 */
  usedHint: boolean;
}

/** 进度存储接口（闯关进度按关卡 ID 记录） */
export interface ProgressStore {
  /** 读取单关进度（无记录返回 null） */
  get(levelId: string): LevelProgress | null;
  /** 全部进度（关卡地图渲染星标用） */
  all(): Map<string, LevelProgress>;
  /**
   * 记录一次通关（只保留更优结果：星数取大、道具数取小）
   * @param levelId 关卡 ID
   * @param stars 本次星数 1-3
   * @param partsUsed 本次使用道具数
   * @param usedHint 本次是否用过提示
   */
  recordClear(levelId: string, stars: number, partsUsed: number, usedHint: boolean): void;
}

/** 内存实现：页面刷新即失（正式存储接入前的过渡） */
export class MemoryProgressStore implements ProgressStore {
  private readonly map = new Map<string, LevelProgress>();

  get(levelId: string): LevelProgress | null {
    return this.map.get(levelId) ?? null;
  }

  all(): Map<string, LevelProgress> {
    return this.map;
  }

  recordClear(levelId: string, stars: number, partsUsed: number, usedHint: boolean): void {
    const prev = this.map.get(levelId);
    if (!prev) {
      this.map.set(levelId, { stars, bestParts: partsUsed, usedHint });
      return;
    }
    this.map.set(levelId, {
      stars: Math.max(prev.stars, stars),
      bestParts: Math.min(prev.bestParts, partsUsed),
      usedHint: prev.usedHint && usedHint,
    });
  }
}
