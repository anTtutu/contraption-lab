/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: events.ts
 * -----------------------------------------------------------------------------
 * 用途: 轻量类型安全事件总线（约 40 行，零依赖）
 *       为什么不直接用 Phaser.EventEmitter？——SimulationEngine 必须「无渲染、
 *       无 Phaser 依赖」才能在 Vitest 里裸跑（设计文档 §10.3 物理内核载体决策），
 *       因此内核自带一个极简发布订阅器，渲染层/UI 层订阅同一套事件即可。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { GameState, EngineMode } from './GameState';

/**
 * 模拟引擎事件表：key = 事件名，value = 该事件 payload 的类型。
 * 新增事件必须先在此登记，发布/订阅两侧才能获得类型检查。
 * （用 type 而非 interface：interface 无隐式索引签名，不满足泛型约束）
 */
export type SimEventMap = {
  /** 道具被载入世界 */
  propAdded: { pid: string };
  /** 道具被移除（绳烧断的整绳/气球爆等） */
  propRemoved: { pid: string };
  /** 易碎目标物被触发爆裂（气球靶/氦气球） */
  propPopped: { pid: string };
  /** 铃铛被敲响（目标物） */
  bellRang: { pid: string };
  /** 状态发生迁移（from → to） */
  stateChanged: { from: GameState; to: GameState };
  /** 倒计时整数秒跳变（3→2→1→0） */
  countdownTick: { remainingSeconds: number };
  /** 物理真正开始运行（倒计时结束或沙盒直接启动） */
  runStarted: { mode: EngineMode };
  /** 目标达成（仅关卡模式，payload = 本次达成的新目标数） */
  goalAchieved: { achievedCount: number };
  /** 道具飞出画布外扩边界 */
  propOutOfBounds: { pid: string; x: number; y: number };
  /** 关卡虚拟运行时长超时（仅关卡模式） */
  runTimeout: { virtualRunMs: number };
  /** 任意两个道具发生碰撞（goal 判定/机关触发的基础事件流） */
  bodiesCollided: { aPid: string; bPid: string; speed: number };
  /** 爆炸特效原语（礼花炸弹引爆时广播，FX 层订阅出彩带粒子） */
  explosion: { x: number; y: number };
  /** 信号通道电平变化（开关压下/复位） */
  channelChanged: { channel: string; on: boolean };
}

/**
 * 泛型发布订阅器：on/off/emit 全部带事件名与 payload 的类型检查
 * @typeParam M 事件表（事件名 → payload 类型），默认使用模拟引擎事件表
 */
export class SimEmitter<M extends Record<string, unknown> = SimEventMap> {
  /** 事件名 → 处理器集合（Set 保证同一函数重复 on 只生效一次） */
  private handlers = new Map<keyof M, Set<(payload: unknown) => void>>();

  /**
   * 订阅事件
   * @param type 事件名
   * @param handler 处理器（收到强类型的 payload）
   * @returns 自身（支持链式订阅）
   */
  on<K extends keyof M>(type: K, handler: (payload: M[K]) => void): this {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (payload: unknown) => void);
    return this;
  }

  /**
   * 取消订阅（未注册过时静默无操作）
   * @param type 事件名
   * @param handler 必须是 on 时传入的同一函数引用
   */
  off<K extends keyof M>(type: K, handler: (payload: M[K]) => void): this {
    this.handlers.get(type)?.delete(handler as (payload: unknown) => void);
    return this;
  }

  /**
   * 发布事件（处理器为空时静默；处理器异常不相互拦截——由调用方保证健壮性）
   * @param type 事件名
   * @param payload 事件数据
   */
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) {
      (handler as (p: M[K]) => void)(payload);
    }
  }

  /**
   * 查询某事件的订阅数（测试与调试用）
   * @param type 事件名
   * @returns 订阅处理器数量
   */
  listenerCount<K extends keyof M>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}
