/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: BallProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 球类道具（设计文档 §5.1 运动体）：木球 / 钢球 / 弹力球
 *       同一形状、三种直觉参数（轻/重/弹），这是「物理直觉三档」的第一个样板道具。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { BALL_RADII, TUNING } from '../PhysicsTuning';

/**
 * 球变体参数表（设计文档 §5.1：轻/重/弹 直觉三档 + 小/大 特例）：
 * - wood    木球：轻、微弹（关卡默认主角）
 * - steel   钢球：4 倍重、几乎不弹（压杠杆/砸击主力，可被磁铁吸引）
 * - bouncy  弹力球：轻 + 高弹 0.9（弹力章节主角）
 * - pingpong 乒乓球：极轻 + 明显空气阻力（风扇章节主角）
 * - bowling 保龄球：最重、不弹（重力势能章节主角，可被磁铁吸引）
 */
const BALL_VARIANT_PARAMS = {
  // 摩擦/空气阻力取近零值：Matter 圆体在斜面上的滚动损耗极大（实测 25° 坡
  // 有效加速度仅理论 1/5，且低速出现终端速度），球类以「顺畅滚落」为第一直觉，
  // 代价是贴图自转不明显——可接受。乒乓球保留高空气阻力作为教学特色。
  wood: { density: TUNING.density.light, restitution: 0.2, friction: 0.001, frictionAir: 0.002 },
  steel: { density: TUNING.density.heavy, restitution: 0.05, friction: 0.001, frictionAir: 0.002 },
  bouncy: { density: TUNING.density.light, restitution: TUNING.restitution.high, friction: 0.001, frictionAir: 0.002 },
  pingpong: { density: 0.0002, restitution: 0.3, friction: 0.001, frictionAir: 0.03 },
  bowling: { density: 0.008, restitution: 0.02, friction: 0.001, frictionAir: 0.002 },
} as const;

/** 球变体 Key 类型 */
export type BallVariant = keyof typeof BALL_VARIANT_PARAMS;

/** 可被磁铁吸引的钢性变体集合 */
const MAGNETIC_VARIANTS: ReadonlySet<string> = new Set(['steel', 'bowling']);

/**
 * 变体字符串安全解析：未识别 / 缺省一律兜底为木球
 * @param variant 关卡数据里的 variant 字段
 * @returns 合法球变体 Key
 */
export function ballVariantOf(variant?: string): BallVariant {
  const keys = Object.keys(BALL_VARIANT_PARAMS) as BallVariant[];
  return keys.includes(variant as BallVariant) ? (variant as BallVariant) : 'wood';
}

/**
 * 判断球变体是否可被磁铁吸引
 * @param variant 球变体
 */
export function isMagneticBall(variant: string): boolean {
  return MAGNETIC_VARIANTS.has(variant);
}

/** 球类道具运行时实例 */
export class BallProp extends PropBase {
  /** 已解析的球变体（注册表据此选择贴图与半径） */
  readonly variant: BallVariant;

  constructor(entry: PropEntry) {
    super(entry);
    this.variant = ballVariantOf(entry.variant);
  }

  /** 球是运动体：缺省非静态 */
  protected get defaultStatic(): boolean {
    return false;
  }

  /** 圆形刚体：半径按变体查表，参数取自变体表 */
  protected buildBody(): Matter.Body {
    const variant = ballVariantOf(this.entry.variant);
    const params = BALL_VARIANT_PARAMS[variant];
    const radius = BALL_RADII[variant] ?? 26;
    return Matter.Bodies.circle(this.entry.x, this.entry.y, radius, {
      ...params,
      isStatic: this.isStaticFinal,
    });
  }
}
