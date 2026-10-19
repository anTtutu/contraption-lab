/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: LevelGoalChecker.ts
 * -----------------------------------------------------------------------------
 * 用途: 关卡目标判定器（设计文档 §5.7 判定规则的实现）
 *       三类目标：
 *       - ball_in_basket：球心入篮口区域且低速保持 0.5s（时间窗判定，§5.7 防闪烁）
 *       - balloon_popped：气球靶被戳爆（订阅 propPopped 事件）
 *       - bell_rung：铃铛被敲响（订阅 bellRang 事件）
 *       全部目标达成 → check() 返回达成数 → 引擎迁移 SUCCESS。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { GoalCheckContext, GoalChecker } from '../engine/GoalChecker';
import type { SimEmitter, SimEventMap } from '../engine/events';
import type { BasketProp } from '../engine/props/GoalProps';
import type { LevelDoc, LevelGoal } from './types';

/** 球进筐判定参数（§5.7：宽进严出 + 时间窗） */
const BASKET_SETTLE_TICKS = 30; // 低速保持 0.5s（60Hz × 0.5）
const BASKET_SLOW_SPEED = 1.2; // px/步
const BASKET_MOUTH_MARGIN = 10; // 篮口内收（扣除壁厚）

export class LevelGoalChecker implements GoalChecker {
  /** 各球进筐目标的连续低速计数（goalKey → ticks） */
  private readonly basketSettled = new Map<string, number>();
  /** 已爆裂道具集合 */
  private readonly popped = new Set<string>();
  /** 已敲响铃铛集合 */
  private readonly rung = new Set<string>();

  constructor(doc: LevelDoc, events: SimEmitter<SimEventMap>) {
    // 事件型目标的输入源：引擎碰撞事件流
    events.on('propPopped', ({ pid }) => this.popped.add(pid));
    events.on('bellRang', ({ pid }) => this.rung.add(pid));
    this.goals = doc.goals;
  }

  private readonly goals: LevelGoal[];

  /**
   * 每固定步执行一次的目标检测
   * @param ctx 检测上下文
   * @returns 本次检测【累计】已达成的目标数（>0 触发 SUCCESS）
   */
  check(ctx: GoalCheckContext): number {
    let achieved = 0;
    for (const goal of this.goals) {
      switch (goal.type) {
        case 'ball_in_basket':
          if (this.checkBasket(goal.actor, goal.target, ctx)) achieved++;
          break;
        case 'balloon_popped':
          if (this.popped.has(goal.target)) achieved++;
          break;
        case 'bell_rung':
          if (this.rung.has(goal.target)) achieved++;
          break;
      }
    }
    return achieved;
  }

  /**
   * 球进筐判定：入篮口 + 低速 + 时间窗
   * @param actorPid 目标球 pid
   * @param basketPid 篮筐 pid
   */
  private checkBasket(actorPid: string, basketPid: string, ctx: GoalCheckContext): boolean {
    const basket = ctx.props.find((p) => p.pid === basketPid) as BasketProp | undefined;
    const ball = ctx.props.find((p) => p.pid === actorPid);
    if (!basket || !ball || basket.removed) return false;

    // 篮口判定矩形：筐中心 ±（口宽/2-壁厚），纵向从口上方 20px 到筐底
    const halfMouth = basket.mouthWidth / 2 - BASKET_MOUTH_MARGIN;
    const topY = basket.entry.y - basket.depth / 2 - 20;
    const bottomY = basket.entry.y + basket.depth / 2;
    const pos = ball.body.position;
    const vel = ball.body.velocity;
    const inMouth =
      Math.abs(pos.x - basket.entry.x) < halfMouth && pos.y > topY && pos.y < bottomY;
    const slow = Math.hypot(vel.x, vel.y) < BASKET_SLOW_SPEED;

    const key = `${actorPid}@${basketPid}`;
    const ticks = inMouth && slow ? (this.basketSettled.get(key) ?? 0) + 1 : 0;
    this.basketSettled.set(key, ticks);
    return ticks >= BASKET_SETTLE_TICKS;
  }
}
