/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SwitchProps.ts
 * -----------------------------------------------------------------------------
 * 用途: 信号联动对（设计文档 §5.5）：按压开关 + 通道接收器（红/蓝双通道）。
 *       开关：被动态物体压过（碰撞）→ 接通所属通道（闩锁式，本轮运行内保持）。
 *       接收器：通道电平的「可视化灯座」——静态体，灯亮与否由 FX/渲染层读通道表。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { CHANNEL_KEYS } from '../PhysicsTuning';

/** 开关尺寸（px） */
export const SWITCH_WIDTH = 90;
export const SWITCH_HEIGHT = 16;
/** 触发撞击阈值（相对速度 px/步） */
const SWITCH_IMPACT_THRESHOLD = 1;

/** 安全解析通道名（非法值兜底 red） */
export function channelOf(meta: Record<string, unknown> | undefined): string {
  const ch = meta?.channel as string;
  return (CHANNEL_KEYS as readonly string[]).includes(ch) ? ch : 'red';
}

/** 按压开关 */
export class PressSwitchProp extends PropBase {
  /** 所属通道 */
  readonly channel: string;

  constructor(entry: PropEntry) {
    super(entry);
    this.channel = channelOf(entry.meta);
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, SWITCH_WIDTH * this.scaleFinal, SWITCH_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 5 },
    });
  }

  override onCollisionEnter(other: PropBase, relativeSpeed: number): void {
    // 动态物体碰到即接通（闩锁式：本轮回合内保持接通）
    if (relativeSpeed < SWITCH_IMPACT_THRESHOLD) return;
    const hasDynamic = other.bodies.some((b) => !b.isStatic);
    if (hasDynamic) {
      this.engine?.setChannel(this.channel, true);
    }
  }
}

/** 接收器尺寸（px） */
export const RECEIVER_WIDTH = 60;
export const RECEIVER_HEIGHT = 70;

/** 通道接收器：静态灯座（电平可视化由渲染层读引擎通道表） */
export class ReceiverProp extends PropBase {
  /** 所属通道 */
  readonly channel: string;

  constructor(entry: PropEntry) {
    super(entry);
    this.channel = channelOf(entry.meta);
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, RECEIVER_WIDTH * this.scaleFinal, RECEIVER_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 8 },
    });
  }
}
