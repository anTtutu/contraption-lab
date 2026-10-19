/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: palette.ts
 * -----------------------------------------------------------------------------
 * 用途: 全局 12 色调色板常量（设计文档 §4.2）
 *       规范约束：所有绘制代码【禁止硬编码色值】，一律引用本文件，
 *       保证「改一处全局生效」的卡通 30% 风格一致性。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 游戏全局调色板（12 色，数值为 0xRRGGBB，可直接传给 Phaser） */
export const PALETTE = {
  /** 背景木墙（页面/画布底色） */
  bgWall: 0xead9b0,
  /** 背景桌板 */
  bgDesk: 0xc9a876,
  /** 描边深棕（全局统一描边色的基色） */
  outline: 0x3a3226,
  /** 金属灰（钢球、齿轮、滑轮等金属件） */
  metalGray: 0xb8bfc7,
  /** 深灰（阴影、次要文字） */
  darkGray: 0x6b7280,
  /** 科技蓝（道具主色） */
  techBlue: 0x4a90d9,
  /** 活力橙（点缀、主按钮、篮筐） */
  accentOrange: 0xf5a623,
  /** 草绿（成功、目标、解锁） */
  grassGreen: 0x7cb342,
  /** 樱桃红（警示、磁铁、弹力球） */
  cherryRed: 0xe05a4e,
  /** 木色（木板、平台、木球） */
  wood: 0xd9a066,
  /** 奶白（面板、乒乓球） */
  creamWhite: 0xfff8ec,
  /** 高光白（高光点、文字） */
  highlightWhite: 0xffffff,
} as const;

/** 调色板条目数（设计规范：12 色以内） */
export const PALETTE_SIZE = 12;

/** 全局统一字体栈：圆体优先，符合儿童友好的柔和观感 */
export const FONT_FAMILY = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif';

/** 全局统一描边宽度（px），设计规范 §4.1：2.5px */
export const STROKE_WIDTH = 2.5;
