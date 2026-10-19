/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: FanProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 风扇道具（设计文档 §5.6）：定向风力区域（风与浮力章节主角）。
 *       实现：静态扇体 + 扇口延伸的矩形风区，区内动态刚体每步获得
 *       沿风向的速度增量（轻物体被吹飞、重物体纹丝不动——物理直觉自然涌现）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import type { StepContext } from '../StepContext';

/** 风扇本体尺寸（px） */
export const FAN_SIZE = 120;
/** 风区长度（px，从扇口延伸） */
export const FAN_WIND_RANGE = 380;
/** 风区宽度（px） */
export const FAN_WIND_WIDTH = 120;

/** 风力档位（速度增量/步）：重力 3 环境下轻物体可被吹动、重物体稳如泰山 */
const WIND_POWERS = [0.2, 0.4, 0.7] as const;

export class FanProp extends PropBase {
  /** 风向（弧度，0 = 向右；meta.dir 角度制） */
  private readonly dirRad: number;
  /** 风力（速度增量/步） */
  private readonly power: number;

  constructor(entry: PropEntry) {
    super(entry);
    this.dirRad = (((entry.meta?.dir as number) ?? 0) * Math.PI) / 180;
    const idx = Math.min(2, Math.max(0, ((entry.meta?.power as number) ?? 2) - 1));
    this.power = WIND_POWERS[idx];
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, FAN_SIZE, FAN_SIZE, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 16 },
    });
  }

  override onFixedStep(ctx: StepContext): void {
    // 风区：从扇心沿风向延伸的矩形（把风向旋到 +x 后做 AABB 判定）
    const cos = Math.cos(-this.dirRad);
    const sin = Math.sin(-this.dirRad);
    const reach = FAN_WIND_RANGE * this.scaleFinal;
    const halfW = (FAN_WIND_WIDTH * this.scaleFinal) / 2;
    for (const prop of ctx.engine.getProps()) {
      if (prop === this || prop.removed) continue;
      for (const body of prop.bodies) {
        if (body.isStatic) continue;
        const dx = body.position.x - this.entry.x;
        const dy = body.position.y - this.entry.y;
        // 旋转到风扇局部坐标系：localX ∈ [0, reach]，|localY| ≤ halfW
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;
        if (localX < 0 || localX > reach || localY < -halfW || localY > halfW) continue;
        Matter.Body.setVelocity(body, {
          x: body.velocity.x + Math.cos(this.dirRad) * this.power,
          y: body.velocity.y + Math.sin(this.dirRad) * this.power,
        });
      }
    }
  }
}
