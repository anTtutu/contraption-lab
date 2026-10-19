/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: PhysicsTuning.ts
 * -----------------------------------------------------------------------------
 * 用途: 物理参数「直觉三档」调参表（设计文档 §5 各道具表 + §10.3 物理决策）
 *       面向小学生的物理直觉：不追求真实单位制，只保证「重球就是砸得动、
 *       冰面就是滑、弹力球就是弹得高」。全部常量集中于此，禁止散落硬编码。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 固定物理步长（ms）：1000/60 ≈ 16.67，确定性的基石（设计文档 §10.3） */
export const FIXED_DT_MS = 1000 / 60;

/** 关卡启动倒计时时长（ms）：3-2-1 */
export const COUNTDOWN_TOTAL_MS = 3000;

/**
 * Matter.js 重力设置（世界坐标系 y 向下为正）
 * y=3：手感调优值——Matter 圆体在斜面上有约 4:1 的固有数值损耗
 * （实测 25° 坡有效加速度仅为理论值 1/5），重力 3 倍补偿后斜面滚动
 * 恢复「越滚越快」直觉，整体节奏也更快，适合儿童注意力。
 */
export const GRAVITY = {
  x: 0,
  y: 3,
} as const;

/** 直觉三档调参表（Matter.js 参数域，非真实物理单位） */
export const TUNING = {
  /** 密度三档：轻（木/乒乓球）/ 中（Matter 默认）/ 重（钢/保龄球） */
  density: {
    light: 0.0008,
    medium: 0.001,
    heavy: 0.004,
  },
  /** 弹性三档：低（钢球落地几乎不弹）/ 中（木板类）/ 高（弹力球 0.9） */
  restitution: {
    low: 0.1,
    mid: 0.4,
    high: 0.9,
  },
  /** 摩擦三档：冰面 / 普通 / 高抓地（橡胶） */
  friction: {
    slippery: 0.01,
    normal: 0.3,
    grippy: 0.8,
  },
  /** 空气阻力：普通（乒乓球/气球将来单独调高） */
  frictionAir: {
    normal: 0.01,
  },
} as const;

/** 球类统一基准半径（px）：wood/steel/bouncy 共用，与 TextureFactory 贴图一致 */
export const BALL_RADIUS = 26;

/**
 * 球变体半径表（px）：不同球允许不同尺寸（乒乓球小、保龄球大），
 * TextureFactory 按同表绘制，保证物理体与贴图严格一致。
 */
export const BALL_RADII: Record<string, number> = {
  wood: 26,
  steel: 26,
  bouncy: 26,
  pingpong: 18,
  bowling: 34,
};

/** 信号通道合法 Key（设计文档 §5.5：红/蓝双通道，防复杂度爆炸） */
export const CHANNEL_KEYS = ['red', 'blue'] as const;

/** 信号通道类型 */
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/** 出界判定的纵向宽松系数：向上飞出按 3 倍边距才算出界（弹簧弹射场景） */
export const OOB_TOP_MARGIN_FACTOR = 3;
