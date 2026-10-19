/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: RackProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 齿条道具（设计文档 §5.3）：与齿轮啮合时「转动变平动」。
 *       运动学方案：每步检测上方/下方 ±150px 内是否啮合了旋转盘，
 *       命中则钉住水平速度 = -ω×r（齿轮转动推动齿条平移），未命中按自由体下落。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import { TUNING } from '../PhysicsTuning';
import { RotatingDiscProp } from './RotatingDiscProp';
import type { StepContext } from '../StepContext';

/** 齿条尺寸（px） */
export const RACK_WIDTH = 200;
export const RACK_HEIGHT = 24;

export class RackProp extends PropBase {
  protected get defaultStatic(): boolean {
    return false; // 动态体：无齿轮支撑时会坠落
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, RACK_WIDTH * this.scaleFinal, RACK_HEIGHT * this.scaleFinal, {
      density: 0.002,
      friction: TUNING.friction.normal,
      frictionAir: 0.02,
      isStatic: this.isStaticFinal,
    });
  }

  override onFixedStep(ctx: StepContext): void {
    // 找最近的啮合圆盘：中心距 ≤ 盘半径 + 齿条半高 + 4px
    let drivenVx: number | null = null;
    for (const prop of ctx.engine.getProps()) {
      if (!(prop instanceof RotatingDiscProp)) continue;
      const dist = Math.hypot(prop.entry.x - this.entry.x, prop.entry.y - this.entry.y);
      const reach = prop.radius + (RACK_HEIGHT * this.scaleFinal) / 2 + 4;
      if (dist > reach) continue;
      // 齿条在盘下方被推动：水平速度 = -ω×r（啮合点线速度方向）
      const omega = prop.currentOmega;
      if (omega !== 0) {
        drivenVx = -omega * prop.radius;
      }
    }
    if (drivenVx !== null) {
      // 运动学钉速：竖直分量清零（被齿轮「托住」）
      Matter.Body.setVelocity(this.body, { x: drivenVx, y: 0 });
      Matter.Body.setAngularVelocity(this.body, 0);
    }
  }
}
