/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: StaticProps.ts
 * -----------------------------------------------------------------------------
 * 用途: 简单静态结构件家族（设计文档 §5.2/§5.6）：
 *       支柱 / 楔形块 / 冰砖 / 弹力垫 / 蹦床 / 曲面轨道
 *       共性：静态、不可被推动，只提供「承接与导向」。全部继承 StaticPropBase，
 *       子类只声明形状与材质参数。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase } from '../PropBase';
import { TUNING } from '../PhysicsTuning';

/** 简单静态件公共基类：恒静态，形状由子类 buildShape 提供 */
abstract class StaticPropBase extends PropBase {
  protected get defaultStatic(): boolean {
    return true;
  }

  protected buildBody(): Matter.Body {
    return this.buildShape();
  }

  /** 子类实现：具体形状刚体 */
  protected abstract buildShape(): Matter.Body;
}

/** 支柱尺寸（px）：竖直细柱 */
export const PILLAR_WIDTH = 24;
export const PILLAR_HEIGHT = 160;

/** 支柱：竖直静态柱（搭建稳定性） */
export class PillarProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, PILLAR_WIDTH * this.scaleFinal, PILLAR_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 6 },
      friction: TUNING.friction.normal,
    });
  }
}

/** 楔形块尺寸（px）：等腰三角 */
export const WEDGE_WIDTH = 120;
export const WEDGE_HEIGHT = 80;

/** 楔形块：三角静态块（改变运动方向；凸形顶点可直接用 fromVertices） */
export class WedgeProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    const w = (WEDGE_WIDTH * this.scaleFinal) / 2;
    const h = (WEDGE_HEIGHT * this.scaleFinal) / 2;
    // 顶点在上的等腰三角形（凸多边形，无需多边形分解）
    return Matter.Bodies.fromVertices(this.entry.x, this.entry.y, [[
      { x: -w, y: h },
      { x: w, y: h },
      { x: 0, y: -h },
    ]], { isStatic: true, angle: this.angleRad, friction: TUNING.friction.normal });
  }
}

/** 冰砖尺寸（px）：超滑横条 */
export const ICE_WIDTH = 160;
export const ICE_HEIGHT = 40;

/** 冰砖：摩擦系数 0.01 的超滑静态面（摩擦章节主角） */
export class IceBlockProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, ICE_WIDTH * this.scaleFinal, ICE_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 8 },
      friction: TUNING.friction.slippery,
    });
  }
}

/** 弹力垫尺寸（px） */
export const BOUNCY_PAD_WIDTH = 140;
export const BOUNCY_PAD_HEIGHT = 18;

/** 弹力垫：高反弹静态薄板（弹性章节基础件） */
export class BouncyPadProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, BOUNCY_PAD_WIDTH * this.scaleFinal, BOUNCY_PAD_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 8 },
      restitution: 0.95,
      friction: TUNING.friction.normal,
    });
  }
}

/** 蹦床尺寸（px）：比弹力垫更宽更弹 */
export const TRAMPOLINE_WIDTH = 180;
export const TRAMPOLINE_HEIGHT = 20;

/** 蹦床：超级弹力垫（restitution 0.98，能量储存） */
export class TrampolineProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    return Matter.Bodies.rectangle(this.entry.x, this.entry.y, TRAMPOLINE_WIDTH * this.scaleFinal, TRAMPOLINE_HEIGHT * this.scaleFinal, {
      isStatic: true,
      angle: this.angleRad,
      chamfer: { radius: 9 },
      restitution: 0.98,
      friction: TUNING.friction.normal,
    });
  }
}

/** 曲面轨道参数：四段薄板拼成 90° 圆弧（半径 150），视觉与物理一致 */
export const CURVED_TRACK_RADIUS = 150;
export const CURVED_TRACK_SEGMENTS = 4;

/**
 * 曲面轨道：静态复合体——4 段细板沿圆弧排布（每段 22.5°）。
 * 用复合体而非真实曲率：稳定（无内棱卡球）且绘制/物理共用同一组参数。
 */
export class CurvedTrackProp extends StaticPropBase {
  protected buildShape(): Matter.Body {
    const r = CURVED_TRACK_RADIUS * this.scaleFinal;
    const parts: Matter.Body[] = [];
    const segCount = CURVED_TRACK_SEGMENTS;
    const segAngle = Math.PI / 2 / segCount;
    for (let i = 0; i < segCount; i++) {
      // 第 i 段中心角：从 22.5° 起（弧的开口朝上，承接来球）
      const a = segAngle * (i + 0.5);
      const seg = Matter.Bodies.rectangle(
        this.entry.x + Math.cos(a) * r,
        this.entry.y + Math.sin(a) * r,
        (r * segAngle) + 12,
        12,
        { angle: a + Math.PI / 2, friction: TUNING.friction.normal },
      );
      parts.push(seg);
    }
    return Matter.Body.create({ parts, isStatic: true });
  }
}
