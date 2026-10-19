/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: PlankProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 木板/斜坡道具（设计文档 §5.2）：最基础的导向结构件
 *       可旋转（15° 步进由编辑器层约束）、固定/活动可切换（缺省固定），
 *       既是玩家手上的搭路道具，也在演示场景中充当地面。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import { TUNING } from '../PhysicsTuning';

/** 木板标准尺寸（px），与 TextureFactory 贴图绘制区一致（贴图另含描边留白） */
export const PLANK_WIDTH = 240;
export const PLANK_HEIGHT = 20;

/** 木板/斜坡道具运行时实例 */
export class PlankProp extends PropBase {
  /** 木板缺省固定（设计文档 §5.2：固定/活动可切换，缺省固定） */
  protected get defaultStatic(): boolean {
    return true;
  }

  /** 圆角矩形刚体（chamfer 模拟视觉圆角，避免生硬碰撞边） */
  protected buildBody(): Matter.Body {
    const w = PLANK_WIDTH * this.scaleFinal;
    const h = PLANK_HEIGHT * this.scaleFinal;
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, w, h, {
      isStatic: this.isStaticFinal,
      angle: this.angleRad,
      chamfer: { radius: 6 },
      friction: TUNING.friction.normal,
    });
  }
}
