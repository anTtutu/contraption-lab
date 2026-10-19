/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: CandleProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 蜡烛道具（设计文档 §5.5）：放置即点燃（可配延时），火焰点燃邻近可燃绳。
 *       「热与延时」章节主角——把「时间」引入连锁链。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { RopeProp } from './RopeProp';
import { BombProp } from './ExplosiveProps';
import type { StepContext } from '../StepContext';

/** 蜡烛尺寸（px） */
export const CANDLE_WIDTH = 36;
export const CANDLE_HEIGHT = 80;
/** 火焰点燃半径（px，以蜡烛顶点为圆心） */
export const CANDLE_FLAME_RANGE = 130;
/** 点燃绳后的燃烧延时（步）：给火焰蔓延动画留时间 */
const BURN_DELAY_STEPS = 48;

export class CandleProp extends PropBase {
  /** 点燃倒计时步数（-1 = 未到点火时刻） */
  private lightCountdown: number;
  /** 已点火 */
  private lit = false;

  constructor(entry: PropEntry) {
    super(entry);
    // meta.delay：点火延时秒数 1-5（缺省 0 = 起跑即燃）
    this.lightCountdown = Math.round(((entry.meta?.delay as number) ?? 0) * 60);
  }

  /** 蜡烛是否已点燃（编辑器/渲染取用） */
  get isLit(): boolean {
    return this.lit;
  }

  /** 蜡烛顶点（火焰中心）世界坐标 */
  get flamePoint(): { x: number; y: number } {
    return { x: this.entry.x, y: this.entry.y - (CANDLE_HEIGHT * this.scaleFinal) / 2 };
  }

  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, CANDLE_WIDTH * this.scaleFinal, CANDLE_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 6 },
    });
  }

  override onFixedStep(ctx: StepContext): void {
    // 1) 延时点火
    if (!this.lit) {
      if (this.lightCountdown > 0) {
        this.lightCountdown--;
        return;
      }
      this.lit = true;
    }
    // 2) 火焰作用：点燃邻近可燃绳 / 引爆邻近礼花炸弹
    const flame = this.flamePoint;
    const range = CANDLE_FLAME_RANGE * this.scaleFinal;
    for (const prop of ctx.engine.getProps()) {
      if (prop.removed) continue;
      const anchor = prop.body.position;
      if (Math.hypot(anchor.x - flame.x, anchor.y - flame.y) > range) continue;
      if (prop instanceof RopeProp && prop.burnable && !prop.isBurned) {
        prop.ignite(BURN_DELAY_STEPS);
      } else if (prop instanceof BombProp) {
        prop.ignite();
      }
    }
  }
}
