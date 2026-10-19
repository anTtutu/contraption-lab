/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ExplosiveProps.ts
 * -----------------------------------------------------------------------------
 * 用途: 能源/触发类道具：礼花炸弹（安全化爆炸）与火箭（反冲推力）。
 *       炸弹：受强力撞击 → 1.5s 引信 → 径向冲击波 + 礼花事件（无恐怖元素）。
 *       火箭：起跑后沿自身朝向持续喷射 1.5s → 燃料尽坠落（反冲直觉）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import type { PropEntry } from '../PropBase';
import type { StepContext } from '../StepContext';

/** 引信时长（步）：1.5s */
const FUSE_STEPS = 90;

/** 礼花炸弹尺寸（px） */
export const BOMB_RADIUS = 20;
/** 引爆撞击阈值（相对速度 px/步） */
const BOMB_IMPACT_THRESHOLD = 3;
/** 爆炸参数：半径与中心速度增量 */
const BOMB_BLAST_RADIUS = 150;
const BOMB_BLAST_POWER = 10;

/** 礼花炸弹 */
export class BombProp extends PropBase {
  /** 引信已点燃 */
  private fused = false;
  /** 引信剩余步数 */
  private fuseCountdown = 0;

  constructor(entry: PropEntry) {
    super(entry);
    // meta.delay：延时自动引爆秒数（0.5-5，缺省 0 = 仅撞击引爆）——「热与延时」章节核心
    const delaySec = ((entry.meta?.delay as number) ?? 0) * 1;
    if (delaySec > 0) {
      this.fused = true;
      this.fuseCountdown = Math.round(delaySec * 60);
    }
  }

  /** 外部点燃（蜡烛火焰/连环爆炸） */
  ignite(): void {
    if (!this.fused) {
      this.fused = true;
      this.fuseCountdown = FUSE_STEPS;
    }
  }

  protected get defaultStatic(): boolean {
    return false;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.circle(this.entry.x, this.entry.y, BOMB_RADIUS * this.scaleFinal, {
      density: 0.001,
      restitution: 0.3,
      friction: 0.3,
      isStatic: this.isStaticFinal,
    });
  }

  override onCollisionEnter(_other: PropBase, relativeSpeed: number): void {
    if (this.fused || relativeSpeed < BOMB_IMPACT_THRESHOLD) return;
    this.ignite();
  }

  override onFixedStep(ctx: StepContext): void {
    if (!this.fused) return;
    this.fuseCountdown--;
    if (this.fuseCountdown > 0) return;
    // 引爆前先处理波及物：点燃半径内炸弹（连环爆）+ 移除可破坏挡板（meta.breakable）
    // + 冲击波戳爆半径内气球靶
    const blastR = BOMB_BLAST_RADIUS * this.scaleFinal;
    for (const prop of ctx.engine.getProps()) {
      if (prop === this || prop.removed) continue;
      const dist = Math.hypot(prop.body.position.x - this.body.position.x, prop.body.position.y - this.body.position.y);
      if (dist > blastR) continue;
      if (prop instanceof BombProp) {
        prop.ignite();
      } else if (prop.entry.meta?.breakable === true) {
        // 可破坏挡板：静态板被炸碎消失（「定时开门」玩法的物理表达）
        ctx.engine.removeProp(prop.pid);
      } else if (prop.type === 'balloonTarget') {
        // 冲击波戳爆气球靶（爆炸=一次大「触碰」）
        ctx.engine.events.emit('propPopped', { pid: prop.pid });
        ctx.engine.removeProp(prop.pid);
      }
    }
    // 引爆：径向冲击波 + 礼花事件，随后自移除
    ctx.engine.explode(this.body.position.x, this.body.position.y, blastR, BOMB_BLAST_POWER);
    ctx.engine.removeProp(this.pid);
  }
}

/** 火箭尺寸（px） */
export const ROCKET_WIDTH = 24;
export const ROCKET_HEIGHT = 60;
/** 喷射时长（步）：1.5s */
const THRUST_STEPS = 90;
/** 每步速度增量与速度上限（px/步）：需显著大于重力加速度 ≈0.83 才能起飞 */
const THRUST_ACCEL = 1.2;
const THRUST_MAX_SPEED = 14;

/** 火箭 */
export class RocketProp extends PropBase {
  /** 剩余喷射步数（-1 = 已熄火/未起跑） */
  private thrustLeft = -1;

  protected get defaultStatic(): boolean {
    return false;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, ROCKET_WIDTH * this.scaleFinal, ROCKET_HEIGHT * this.scaleFinal, {
      density: 0.0008,
      frictionAir: 0.01,
      chamfer: { radius: 8 },
      isStatic: this.isStaticFinal,
    });
  }

  override onRunStart(): void {
    this.thrustLeft = THRUST_STEPS;
  }

  override onFixedStep(_ctx: StepContext): void {
    if (this.thrustLeft <= 0) return;
    this.thrustLeft--;
    // 沿自身「头朝向」（角度 -90° 的本地 +y 方向）加速，封顶限速
    const dir = this.angleRad - Math.PI / 2;
    const body = this.body;
    const vx = body.velocity.x + Math.cos(dir) * THRUST_ACCEL;
    const vy = body.velocity.y + Math.sin(dir) * THRUST_ACCEL;
    const speed = Math.hypot(vx, vy);
    if (speed <= THRUST_MAX_SPEED) {
      Matter.Body.setVelocity(body, { x: vx, y: vy });
    }
  }
}
