/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: FloatProps.ts
 * -----------------------------------------------------------------------------
 * 用途: 浮力与角色道具：氦气球（浮力章节主角）+ 小仓鼠咕噜（吉祥物彩蛋动力）。
 *       气球：超低密度 + 每步竖直向上加速度（等效浮力 > 重力），受击爆裂。
 *       咕噜：滚轮模式——每步给角速度，靠摩擦像轮子一样「跑」起来。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import type { StepContext } from '../StepContext';

/** 气球半径（px） */
export const BALLOON_RADIUS = 22;
/** 每步浮力加速度（px/步²，方向向上）：需明显大于重力加速度 ≈0.83（y=3）才升得起来 */
const BUOYANCY_ACCEL = 1.2;
/** 上升速度上限（px/步） */
const BALLOON_MAX_RISE = 5;
/** 爆裂撞击阈值（相对速度 px/步） */
const BALLOON_POP_THRESHOLD = 5;

/** 氦气球 */
export class BalloonProp extends PropBase {
  protected get defaultStatic(): boolean {
    return false;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.circle(this.entry.x, this.entry.y, BALLOON_RADIUS * this.scaleFinal, {
      density: 0.0002,
      restitution: 0.6,
      friction: 0.05,
      frictionAir: 0.04,
      isStatic: this.isStaticFinal,
    });
  }

  override onFixedStep(_ctx: StepContext): void {
    // 等效浮力：向上加速度（封顶上升速度，避免瞬间窜天）
    const body = this.body;
    if (body.velocity.y > -BALLOON_MAX_RISE) {
      Matter.Body.setVelocity(body, { x: body.velocity.x, y: body.velocity.y - BUOYANCY_ACCEL });
    }
  }

  override onCollisionEnter(_other: PropBase, relativeSpeed: number): void {
    // 受强力撞击爆裂（尖物戳破的直觉化：只看力度）
    if (relativeSpeed < BALLOON_POP_THRESHOLD || this.removed) return;
    this.engine?.events.emit('propPopped', { pid: this.pid });
    this.engine?.removeProp(this.pid);
  }
}

/** 咕噜半径（px） */
export const HAMSTER_RADIUS = 24;
/** 跑步角速度（rad/步，方向由 meta.dir 控制） */
const HAMSTER_OMEGA = 0.18;

/** 小仓鼠咕噜（滚轮式跑动：靠摩擦把自转变前进） */
export class HamsterProp extends PropBase {
  /** 朝向（±1，缺省向右） */
  private readonly dir: number;

  constructor(entry: PropEntry) {
    super(entry);
    this.dir = ((entry.meta?.dir as number) ?? 1) >= 0 ? 1 : -1;
  }

  protected get defaultStatic(): boolean {
    return false;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.circle(this.entry.x, this.entry.y, HAMSTER_RADIUS * this.scaleFinal, {
      density: 0.001,
      friction: 0.8, // 高抓地：自转才能有效变前进
      frictionAir: 0.01,
      isStatic: this.isStaticFinal,
    });
  }

  override onFixedStep(_ctx: StepContext): void {
    // 像仓鼠轮：持续自转 + 高摩擦 = 向前跑
    Matter.Body.setAngularVelocity(this.body, HAMSTER_OMEGA * this.dir);
  }
}
