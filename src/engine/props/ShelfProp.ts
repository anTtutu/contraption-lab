/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ShelfProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 固定平台道具（设计文档 §5.2）：静态搁板，永远不可被推动。
 *       与 PlankProp 的区别：玩家不可改其静态性（关卡里用于「预定结构」）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import { TUNING } from '../PhysicsTuning';

/** 平台标准尺寸（px），与 TextureFactory 贴图绘制区一致 */
export const SHELF_WIDTH = 200;
export const SHELF_HEIGHT = 24;

/** 固定平台道具运行时实例 */
export class ShelfProp extends PropBase {
  /** 平台缺省（且恒为）静态 */
  protected get defaultStatic(): boolean {
    return true;
  }

  /** 圆角矩形刚体；静态性强制 true，忽略关卡数据里的误配 */
  protected buildBody(): Matter.Body {
    const w = SHELF_WIDTH * this.scaleFinal;
    const h = SHELF_HEIGHT * this.scaleFinal;
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, w, h, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 6 },
      friction: TUNING.friction.normal,
    });
  }
}
