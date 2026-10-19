/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SeesawProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 跷跷板道具（设计文档 §5.2，杠杆章节主角）
 *       实现：动态长板 + 中心销约束（pointA=世界锚点，length=0, stiffness=1），
 *       杠杆效应完全由物理求解——重球压一端自然翘起另一端，无需任何脚本。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { TUNING } from '../PhysicsTuning';
import type { StepContext } from '../StepContext';

/** 跷跷板长板尺寸（px）：足够长以放大杠杆效应 */
export const SEESAW_LENGTH = 360;
export const SEESAW_THICKNESS = 14;
/** 板摆动限位（rad，约 20°）：真实跷跷板两头触地即止，防止被砸后 360° 旋转 */
const TILT_LIMIT = 0.35;

export class SeesawProp extends PropBase {
  protected get defaultStatic(): boolean {
    return false; // 板身是动态体，靠中心销悬在锚点上
  }

  protected buildBody(): Matter.Body {
    const len = SEESAW_LENGTH * this.scaleFinal;
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, len, SEESAW_THICKNESS * this.scaleFinal, {
      // 轻板：同样砸击冲量下角速度更大，杠杆抛射更有力（实测等重板弹高仅 36px）
      density: 0.0008,
      angle: this.angleRad,
      chamfer: { radius: 5 },
      friction: TUNING.friction.normal,
      frictionAir: 0.02, // 轻微角阻尼：避免无限摇摆不收敛
      isStatic: this.isStaticFinal,
    });
  }

  constructor(entry: PropEntry) {
    super(entry);
    // 中心销：把长板钉在编辑摆放点（世界锚点），可自由旋转
    const pin = Matter.Constraint.create({
      pointA: { x: entry.x, y: entry.y },
      bodyB: this.body,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 1,
    });
    this.constraints.push(pin);
  }

  override onFixedStep(_ctx: StepContext): void {
    // 限位：板角超出 ±TILT_LIMIT 即夹回并卸掉角速度（模拟两端触地）。
    // 注意 Matter 角度连续累计不 wrap，超界后每步硬夹会累积 Prev 偏差——
    // 用「过界才干预」策略，界内完全不碰，保证自由摆动的确定性。
    const a = this.body.angle;
    if (a > TILT_LIMIT) {
      Matter.Body.setAngle(this.body, TILT_LIMIT);
      if (this.body.angularVelocity > 0) Matter.Body.setAngularVelocity(this.body, 0);
    } else if (a < -TILT_LIMIT) {
      Matter.Body.setAngle(this.body, -TILT_LIMIT);
      if (this.body.angularVelocity < 0) Matter.Body.setAngularVelocity(this.body, 0);
    }
  }
}
