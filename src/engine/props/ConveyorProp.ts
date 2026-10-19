/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ConveyorProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 传送带道具（设计文档 §5.3）：静态框架 + 「速度面」输送。
 *       实现（§10.3 既定）：每步扫描带上方的动态刚体，把其水平速度向带速
 *       渐近靠拢（lerp 0.25/步）——视觉是带子在动，物理是摩擦输送，稳定无抖动。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { TUNING } from '../PhysicsTuning';
import type { StepContext } from '../StepContext';

/** 传送带尺寸（px） */
export const CONVEYOR_WIDTH = 260;
export const CONVEYOR_HEIGHT = 30;

/** 带速档位（px/步）：慢/中/快 */
const BELT_SPEEDS = [1.5, 3, 5] as const;

export class ConveyorProp extends PropBase {
  /** 带速（px/步，带方向） */
  private readonly beltVx: number;

  constructor(entry: PropEntry) {
    super(entry);
    const speedIdx = Math.min(2, Math.max(0, ((entry.meta?.speed as number) ?? 1) - 1));
    const dir = ((entry.meta?.dir as number) ?? 1) >= 0 ? 1 : -1;
    this.beltVx = BELT_SPEEDS[speedIdx] * dir;
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, CONVEYOR_WIDTH * this.scaleFinal, CONVEYOR_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 4 },
      friction: TUNING.friction.grippy,
    });
  }

  override onFixedStep(ctx: StepContext): void {
    // 带面世界坐标（仅支持水平传送带；角度由美术层表达，物理按水平处理）
    const halfW = (CONVEYOR_WIDTH * this.scaleFinal) / 2;
    const top = this.entry.y - (CONVEYOR_HEIGHT * this.scaleFinal) / 2;
    for (const prop of ctx.engine.getProps()) {
      if (prop === this || prop.removed) continue;
      for (const body of prop.bodies) {
        if (body.isStatic) continue;
        const { x, y } = body.position;
        // 输送区：带上方 40px 高度带内、水平在带范围内的物体
        if (x < this.entry.x - halfW || x > this.entry.x + halfW) continue;
        if (y < top - 40 || y > top + 4) continue;
        // 水平速度向带速渐近（lerp 0.25/步），竖直速度保持（重力照常）
        Matter.Body.setVelocity(body, {
          x: body.velocity.x + (this.beltVx - body.velocity.x) * 0.25,
          y: body.velocity.y,
        });
      }
    }
  }
}
