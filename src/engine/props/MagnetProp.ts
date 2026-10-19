/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: MagnetProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 磁铁道具（设计文档 §5.6）：U 形电磁铁，通电吸引钢性物体。
 *       吸引对象：BallProp 的 steel/bowling 变体（isMagneticBall）。
 *       通断控制：meta.channel 非空时受信号通道控制（缺省常通）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { BallProp, isMagneticBall } from './BallProp';
import type { StepContext } from '../StepContext';

/** 磁铁本体尺寸（px） */
export const MAGNET_WIDTH = 90;
export const MAGNET_HEIGHT = 90;
/** 吸引半径（px） */
export const MAGNET_RANGE = 220;
/** 吸引加速度档位（速度增量/步）：重力 3 环境下的吸附力标定 */
const MAGNET_POWERS = [0.2, 0.4, 0.7] as const;

export class MagnetProp extends PropBase {
  /** 信号通道（空 = 常通） */
  private readonly channel: string;
  /** 吸引加速度 */
  private readonly power: number;

  constructor(entry: PropEntry) {
    super(entry);
    this.channel = (entry.meta?.channel as string) ?? '';
    const idx = Math.min(2, Math.max(0, ((entry.meta?.power as number) ?? 2) - 1));
    this.power = MAGNET_POWERS[idx];
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, MAGNET_WIDTH, MAGNET_HEIGHT, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 12 },
    });
  }

  override onFixedStep(ctx: StepContext): void {
    // 通断判定：无通道常通；有通道看电平
    if (this.channel && !ctx.channels.get(this.channel)) return;
    const range = MAGNET_RANGE * this.scaleFinal;
    for (const prop of ctx.engine.getProps()) {
      if (prop === this || prop.removed) continue;
      // 仅吸引钢性球（对象白名单：steel/bowling 变体）
      if (!(prop instanceof BallProp) || !isMagneticBall(prop.variant)) continue;
      const body = prop.body;
      const dx = this.entry.x - body.position.x;
      const dy = this.entry.y - body.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > range || dist < 1) continue;
      // 向磁心加速（近处不衰减，简单可控）
      Matter.Body.setVelocity(body, {
        x: body.velocity.x + (dx / dist) * this.power,
        y: body.velocity.y + (dy / dist) * this.power,
      });
      Matter.Sleeping.set(body, false);
    }
  }
}
