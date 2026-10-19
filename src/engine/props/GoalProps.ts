/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: GoalProps.ts
 * -----------------------------------------------------------------------------
 * 用途: 目标物家族（设计文档 §5.7）：篮筐 / 喂食碗 / 气球靶 / 铃铛。
 *       - 篮筐/喂食碗：静态复合体（左右壁+底），判定区域由关卡目标系统（步骤 4）
 *         按道具位置与尺寸几何计算，本类只提供物理容器
 *       - 气球靶：传感器圆（可穿入），任意动态物触碰即爆 → propPopped 事件
 *       - 铃铛：静态铃体，被足够力度的运动体敲击 → bellRang 事件
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import type { StepContext } from '../StepContext';

/** 篮筐尺寸（px）：筐口宽与筐深 */
export const BASKET_MOUTH = 150;
export const BASKET_DEPTH = 110;
export const BASKET_WALL = 12;

/** 篮筐/喂食碗：静态容器复合体（喂食碗按 0.75 缩放同构） */
export class BasketProp extends PropBase {
  /** 筐口宽（渲染层/目标判定取用） */
  get mouthWidth(): number {
    return BASKET_MOUTH * this.scaleFinal * (this.type === 'feedBowl' ? 0.75 : 1);
  }

  /** 筐深（目标判定取用） */
  get depth(): number {
    return BASKET_DEPTH * this.scaleFinal * (this.type === 'feedBowl' ? 0.75 : 1);
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    const s = this.scaleFinal * (this.type === 'feedBowl' ? 0.75 : 1);
    const mouth = BASKET_MOUTH * s;
    const depth = BASKET_DEPTH * s;
    const wall = BASKET_WALL;
    // 复合体：左壁 + 右壁 + 底板（左壁稍高形成「筐口内收」的承接感）
    const left = Matter.Bodies.rectangle(this.entry.x - mouth / 2, this.entry.y, wall, depth, {});
    const right = Matter.Bodies.rectangle(this.entry.x + mouth / 2, this.entry.y, wall, depth, {});
    const bottom = Matter.Bodies.rectangle(this.entry.x, this.entry.y + depth / 2, mouth + wall * 2, wall, {});
    return Matter.Body.create({ parts: [left, right, bottom], isStatic: true });
  }
}

/** 气球靶半径（px） */
export const BALLOON_TARGET_RADIUS = 30;

/** 气球靶：传感器圆，任意动态物触碰即爆 */
export class BalloonTargetProp extends PropBase {
  protected get defaultStatic(): boolean {
    return false;
  }

  protected buildBody(): Matter.Body {
    // isSensor：穿透型判定区（气球不阻挡来球，纯触碰检测）
    return Matter.Bodies.circle(this.entry.x, this.entry.y, BALLOON_TARGET_RADIUS * this.scaleFinal, {
      isStatic: true,
      isSensor: true,
    });
  }

  override onCollisionEnter(other: PropBase, _relativeSpeed: number): void {
    if (this.removed) return;
    // 氦气球撞靶：无条件双爆（气球升空必然最终接触，不设速度门槛）
    if (other.type === 'balloon') {
      this.engine?.events.emit('propPopped', { pid: other.pid });
      this.engine?.removeProp(other.pid);
      this.engine?.events.emit('propPopped', { pid: this.pid });
      this.engine?.removeProp(this.pid);
      return;
    }
    // 仅动态物体可触发（气球靶自己不会凭空爆）
    const hasDynamic = other.bodies.some((b) => !b.isStatic);
    if (!hasDynamic) return;
    this.engine?.events.emit('propPopped', { pid: this.pid });
    this.engine?.removeProp(this.pid);
  }
}

/** 铃铛尺寸（px） */
export const BELL_WIDTH = 60;
export const BELL_HEIGHT = 70;
/** 敲响阈值（相对速度 px/步） */
const BELL_RING_THRESHOLD = 2;

/** 铃铛：被足够力度的运动体敲响 */
export class BellProp extends PropBase {
  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, BELL_WIDTH * this.scaleFinal, BELL_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 14 },
    });
  }

  override onFixedStep(_ctx: StepContext): void {
    // 占位：铃铛无每步行为（触发在 onCollisionEnter）
  }

  override onCollisionEnter(other: PropBase, relativeSpeed: number): void {
    if (relativeSpeed < BELL_RING_THRESHOLD || this.removed) return;
    const hasDynamic = other.bodies.some((b) => !b.isStatic);
    if (!hasDynamic) return;
    this.engine?.events.emit('bellRang', { pid: this.pid });
  }
}
