/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SpringLauncherProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 弹簧发射器（设计文档 §5.5）：预置方向与力度的弹性势能发射台。
 *       起跑瞬间对发射口区域内的动态刚体一次性施加定向速度（§5.5 交互简化）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';

/** 发射器底座尺寸（px） */
export const LAUNCHER_WIDTH = 80;
export const LAUNCHER_HEIGHT = 46;

/** 力度档位（速度增量 px/步） */
const LAUNCH_POWERS = [12, 18] as const;

export class SpringLauncherProp extends PropBase {
  /** 发射方向（弧度；meta.dir 角度制，0=右、-90=上，缺省 -75° 斜上） */
  private readonly dirRad: number;
  /** 发射速度 */
  private readonly power: number;

  constructor(entry: PropEntry) {
    super(entry);
    this.dirRad = (((entry.meta?.dir as number) ?? -75) * Math.PI) / 180;
    const idx = Math.min(1, Math.max(0, ((entry.meta?.power as number) ?? 2) - 1));
    this.power = LAUNCH_POWERS[idx];
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, LAUNCHER_WIDTH * this.scaleFinal, LAUNCHER_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 10 },
    });
  }

  override onRunStart(): void {
    // 发射口区域 = 底座上方 60px 半径内的动态刚体（放球到口上即被发射）
    const range = 60 * this.scaleFinal;
    const props = this.engine?.getProps() ?? [];
    for (const prop of props) {
      if (prop === this || prop.removed) continue;
      for (const body of prop.bodies) {
        if (body.isStatic) continue;
        const dx = body.position.x - this.entry.x;
        const dy = body.position.y - this.entry.y;
        if (Math.hypot(dx, dy) > range) continue;
        Matter.Body.setVelocity(body, {
          x: Math.cos(this.dirRad) * this.power,
          y: Math.sin(this.dirRad) * this.power,
        });
      }
    }
  }
}
