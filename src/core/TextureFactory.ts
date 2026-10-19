/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: TextureFactory.ts
 * -----------------------------------------------------------------------------
 * 用途: 程序化矢量纹理工厂（设计文档 §4.4 已拍板方案）
 *       所有道具图形 = Phaser Graphics 矢量绘制 → generateTexture 生成贴图，
 *       零外部素材依赖；色值一律取自 PALETTE，描边/圆角遵循「卡通 30%」规范：
 *       - 统一描边 2.5px（颜色 = 材质色加深 40%）
 *       - 锐角圆角化（圆角半径 ≥ 短边 15%，最小 4px）
 *       本文件当前承载「步骤 1 骨架验收」演示纹理；步骤 3 会演进为
 *       「每道具一个绘制函数」的完整道具注册表（PropRegistry）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, STROKE_WIDTH } from './palette';
import { darken } from './color';

/** 球类道具标准半径（px），后续步骤抽到 PhysicsTuning */
const BALL_RADIUS = 26;

/** 纹理 Key 登记表（新增纹理必须先在此注册，全局唯一） */
export const TEX_KEYS = {
  /** 木板/斜坡 */
  PLANK: 'prop.plank',
  /** 固定平台 */
  SHELF: 'prop.shelf',
  /** 木球 */
  BALL_WOOD: 'prop.ball.wood',
  /** 钢球 */
  BALL_STEEL: 'prop.ball.steel',
  /** 弹力球 */
  BALL_BOUNCY: 'prop.ball.bouncy',
  /** 乒乓球 */
  BALL_PINGPONG: 'prop.ball.pingpong',
  /** 保龄球 */
  BALL_BOWLING: 'prop.ball.bowling',
  /** 篮筐（目标物） */
  BASKET: 'prop.basket',
  // ---- 结构类 ----
  PILLAR: 'prop.pillar',
  WEDGE: 'prop.wedge',
  ICE_BLOCK: 'prop.iceBlock',
  BOUNCY_PAD: 'prop.bouncyPad',
  TRAMPOLINE: 'prop.trampoline',
  CURVED_TRACK: 'prop.curvedTrack',
  SEESAW: 'prop.seesaw',
  // ---- 传动类 ----
  MOTOR: 'prop.motor',
  GEAR_LARGE: 'prop.gear.large',
  GEAR_MIDDLE: 'prop.gear.middle',
  GEAR_SMALL: 'prop.gear.small',
  RACK: 'prop.rack',
  CONVEYOR: 'prop.conveyor',
  PULLEY: 'prop.pulley',
  CAM: 'prop.cam',
  TURNTABLE: 'prop.turntable',
  ROPE_LINK: 'prop.ropeLink',
  // ---- 能源/触发类 ----
  CANDLE: 'prop.candle',
  SPRING_LAUNCHER: 'prop.springLauncher',
  BOMB: 'prop.bomb',
  ROCKET: 'prop.rocket',
  PRESS_SWITCH: 'prop.pressSwitch',
  RECEIVER: 'prop.receiver',
  // ---- 特殊类 ----
  FAN: 'prop.fan',
  MAGNET: 'prop.magnet',
  BALLOON: 'prop.balloon',
  HAMSTER: 'prop.hamster',
  // ---- 目标物 ----
  BALLOON_TARGET: 'prop.balloonTarget',
  BELL: 'prop.bell',
  FEED_BOWL: 'prop.feedBowl',
  // ---- 特效 ----
  FX_SPARK: 'fx.spark',
  FX_RECT: 'fx.rect',
} as const;

/** 纹理尺寸四周留白：容纳描边线宽不被裁切 */
const TEXTURE_PADDING = 4;

/**
 * 计算符合规范的圆角半径：≥ 短边 15%，且最小 4px（设计文档 §4.1）
 * @param w 图形宽
 * @param h 图形高
 * @returns 圆角半径（px）
 */
export function roundRadius(w: number, h: number): number {
  return Math.max(4, Math.round(Math.min(w, h) * 0.15));
}

/**
 * 通用纹理构建器：创建离屏 Graphics → 执行绘制 → 生成贴图 → 销毁
 * @param scene 任意场景（仅借用其 GameObjectCreator，不往显示列表加东西）
 * @param key 纹理 Key（必须来自 TEX_KEYS）
 * @param width 纹理宽（px）
 * @param height 纹理高（px）
 * @param draw 具体绘制函数
 */
function buildTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  // add:false → 离屏对象，不进入显示列表，生成完立即销毁
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/**
 * 绘制「卡通 30%」标准圆球：材质底色 + 左上高光 + 深化描边
 * @param g Graphics 画笔
 * @param fill 材质底色（0xRRGGBB）
 * @returns 纹理尺寸（宽与高相同）
 */
function drawBall(g: Phaser.GameObjects.Graphics, fill: number): { size: number } {
  const pad = TEXTURE_PADDING;
  const center = BALL_RADIUS + pad;
  const size = (BALL_RADIUS + pad) * 2;

  // 1) 球体底色
  g.fillStyle(fill, 1);
  g.fillCircle(center, center, BALL_RADIUS);

  // 2) 底部暗面（仅钢球：金属质感需要上下两段明暗）
  if (fill === PALETTE.metalGray) {
    g.fillStyle(darken(fill, 0.25), 0.35);
    g.fillEllipse(center, center + BALL_RADIUS * 0.45, BALL_RADIUS * 1.1, BALL_RADIUS * 0.5);
  }

  // 3) 左上高光（卡通光源约定：光源固定在左上 45°）
  g.fillStyle(PALETTE.highlightWhite, 0.55);
  g.fillEllipse(
    center - BALL_RADIUS * 0.35,
    center - BALL_RADIUS * 0.4,
    BALL_RADIUS * 0.5,
    BALL_RADIUS * 0.32,
  );

  // 4) 统一描边（材质色加深 40%）
  g.lineStyle(STROKE_WIDTH, darken(fill, 0.4), 1);
  g.strokeCircle(center, center, BALL_RADIUS);

  return { size };
}

/**
 * 步骤 1 验收演示纹理总生成入口
 * 幂等：generateTexture 同 key 重复调用会覆盖，BootScene 每次启动调用一次即可
 * @param scene 任意场景
 */
export function generateAll(scene: Phaser.Scene): void {
  // ---- 木板（斜坡）：240×20 圆角木条 + 两条木纹 ----
  buildTexture(scene, TEX_KEYS.PLANK, 248, 28, (g) => {
    const p = TEXTURE_PADDING;
    const w = 240;
    const h = 20;
    g.fillStyle(PALETTE.wood, 1);
    g.fillRoundedRect(p, p, w, h, roundRadius(w, h));
    // 木纹：两条低透明度横向短线
    g.lineStyle(2, darken(PALETTE.wood, 0.4), 0.25);
    g.lineBetween(p + 40, p + h * 0.35, p + w - 60, p + h * 0.35);
    g.lineBetween(p + 70, p + h * 0.65, p + w - 30, p + h * 0.65);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.wood, 0.4), 1);
    g.strokeRoundedRect(p, p, w, h, roundRadius(w, h));
  });

  // ---- 固定平台：200×24 搁板 + 两个三角托架 ----
  buildTexture(scene, TEX_KEYS.SHELF, 208, 48, (g) => {
    const p = TEXTURE_PADDING;
    const w = 200;
    const h = 24;
    g.fillStyle(PALETTE.wood, 1);
    g.fillRoundedRect(p, p, w, h, roundRadius(w, h));
    // 左右三角托架（等腰直角，视觉暗示「固定支撑」）
    g.fillTriangle(p + 26, p + h, p + 54, p + h, p + 26, p + h + 18);
    g.fillTriangle(p + w - 54, p + h, p + w - 26, p + h, p + w - 26, p + h + 18);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.wood, 0.4), 1);
    g.strokeRoundedRect(p, p, w, h, roundRadius(w, h));
  });

  // ---- 三种球（同形不同色：轻/重/弹 的视觉直觉区分）----
  buildTexture(scene, TEX_KEYS.BALL_WOOD, 60, 60, (g) => {
    drawBall(g, PALETTE.wood);
  });
  buildTexture(scene, TEX_KEYS.BALL_STEEL, 60, 60, (g) => {
    drawBall(g, PALETTE.metalGray);
  });
  buildTexture(scene, TEX_KEYS.BALL_BOUNCY, 60, 60, (g) => {
    drawBall(g, PALETTE.cherryRed);
  });

  // ---- 篮筐：橙色筐身 + 加深筐沿 + 编织纹（目标物）----
  buildTexture(scene, TEX_KEYS.BASKET, 166, 144, (g) => {
    const p = TEXTURE_PADDING;
    const rimW = 158;
    const bodyW = 148;
    // 筐身
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillRoundedRect(p + 4, p + 20, bodyW, 116, roundRadius(bodyW, 116));
    // 编织纹：3 竖 3 横，低透明度
    g.lineStyle(2, darken(PALETTE.accentOrange, 0.4), 0.35);
    for (const vx of [45, 83, 121]) {
      g.lineBetween(p + vx, p + 26, p + vx, p + 132);
    }
    for (const vy of [56, 88, 116]) {
      g.lineBetween(p + 10, p + vy, p + 146, p + vy);
    }
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.4), 1);
    g.strokeRoundedRect(p + 4, p + 20, bodyW, 116, roundRadius(bodyW, 116));
    // 筐沿（压在筐身上层，颜色加深突出开口）
    g.fillStyle(darken(PALETTE.accentOrange, 0.2), 1);
    g.fillRoundedRect(p, p, rimW, 16, roundRadius(rimW, 16));
    g.strokeRoundedRect(p, p, rimW, 16, roundRadius(rimW, 16));
  });

  // ---- 步骤 3：全量道具纹理 ----
  generateExtendedAll(scene);

  // ---- 步骤 8：特效粒子纹理 ----
  buildTexture(scene, TEX_KEYS.FX_SPARK, 6, 6, (g) => {
    g.fillStyle(PALETTE.highlightWhite, 1);
    g.fillCircle(3, 3, 2.6);
  });
  buildTexture(scene, TEX_KEYS.FX_RECT, 10, 5, (g) => {
    g.fillStyle(PALETTE.highlightWhite, 1);
    g.fillRoundedRect(1, 1, 8, 3, 1.5);
  });
}

/** 骨架验收页展示清单（纹理 Key + 中文名） */
export const DEMO_SHOWCASE: ReadonlyArray<{ key: string; label: string }> = [
  { key: TEX_KEYS.PLANK, label: '木板（斜坡）' },
  { key: TEX_KEYS.SHELF, label: '固定平台' },
  { key: TEX_KEYS.BASKET, label: '篮筐' },
  { key: TEX_KEYS.BALL_WOOD, label: '木球' },
  { key: TEX_KEYS.BALL_STEEL, label: '钢球' },
  { key: TEX_KEYS.BALL_BOUNCY, label: '弹力球' },
];

/* ============================================================================
 * 步骤 3：全量道具绘制函数区（§5 道具表）
 * 绘制约定：p = 描边留白；所有描边 = 材质色加深 40%；锐角圆角化。
 * ==========================================================================*/

/** 通用圆角块：填充 + 加深描边（多数道具的基底绘制） */
function block(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  radius?: number,
): void {
  const r = radius ?? roundRadius(w, h);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(STROKE_WIDTH, darken(fill, 0.4), 1);
  g.strokeRoundedRect(x, y, w, h, r);
}

/** 通用圆盘：填充 + 高光 + 加深描边（轮盘类基底） */
function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, fill: number, hub = true): void {
  g.fillStyle(fill, 1);
  g.fillCircle(cx, cy, r);
  g.fillStyle(PALETTE.highlightWhite, 0.4);
  g.fillEllipse(cx - r * 0.3, cy - r * 0.35, r * 0.7, r * 0.45);
  g.lineStyle(STROKE_WIDTH, darken(fill, 0.4), 1);
  g.strokeCircle(cx, cy, r);
  if (hub) {
    // 中轴销孔（深棕小圆），呼应「钉在轴上」的物理实现
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(cx, cy, Math.max(4, r * 0.12));
  }
}

/** 齿轮：盘体 + 环向齿 + 中轴孔 */
function gearTexture(scene: Phaser.Scene, key: string, radius: number, fill: number): void {
  buildTexture(scene, key, radius * 2 + 28, radius * 2 + 28, (g) => {
    const c = radius + 14;
    // 齿：8 齿环向矩形（旋转画布绘制）
    g.fillStyle(darken(fill, 0.15), 1);
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translateCanvas(c, c);
      g.rotateCanvas((Math.PI * 2 * i) / 8);
      g.fillRect(-7, -radius - 6, 14, 12);
      g.restore();
    }
    disc(g, c, c, radius, fill);
  });
}

/** 步骤 3 全量纹理生成入口（由 generateAll 调用） */
export function generateExtendedAll(scene: Phaser.Scene): void {
  // ---- 球类补充变体 ----
  buildTexture(scene, TEX_KEYS.BALL_PINGPONG, 52, 52, (g) => {
    drawBallRadius(g, 18, PALETTE.highlightWhite);
  });
  buildTexture(scene, TEX_KEYS.BALL_BOWLING, 84, 84, (g) => {
    drawBallRadius(g, 34, PALETTE.darkGray);
    // 三个指孔
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(42, 26, 4);
    g.fillCircle(34, 36, 4);
    g.fillCircle(50, 36, 4);
  });

  // ---- 结构类 ----
  buildTexture(scene, TEX_KEYS.PILLAR, 32, 168, (g) => {
    block(g, 4, 4, 24, 160, PALETTE.wood);
    // 上下端板（视觉「托架」）
    g.fillStyle(darken(PALETTE.wood, 0.25), 1);
    g.fillRect(4, 4, 24, 6);
    g.fillRect(4, 158, 24, 6);
  });
  buildTexture(scene, TEX_KEYS.WEDGE, 128, 88, (g) => {
    g.fillStyle(PALETTE.wood, 1);
    g.fillTriangle(4, 84, 124, 84, 64, 6);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.wood, 0.4), 1);
    g.strokeTriangle(4, 84, 124, 84, 64, 6);
  });
  buildTexture(scene, TEX_KEYS.ICE_BLOCK, 168, 48, (g) => {
    block(g, 4, 4, 160, 40, 0xCFE8F5);
    // 冰面高光斜线
    g.lineStyle(3, PALETTE.highlightWhite, 0.7);
    g.lineBetween(24, 36, 56, 12);
    g.lineBetween(64, 38, 104, 10);
  });
  buildTexture(scene, TEX_KEYS.BOUNCY_PAD, 148, 26, (g) => {
    block(g, 4, 4, 140, 18, PALETTE.grassGreen);
  });
  buildTexture(scene, TEX_KEYS.TRAMPOLINE, 188, 56, (g) => {
    block(g, 4, 4, 180, 20, PALETTE.techBlue);
    // 两条斜撑腿
    g.lineStyle(6, darken(PALETTE.techBlue, 0.4), 1);
    g.lineBetween(40, 24, 24, 52);
    g.lineBetween(148, 24, 164, 52);
  });
  buildTexture(scene, TEX_KEYS.CURVED_TRACK, 210, 210, (g) => {
    // 90° 圆弧滑道（半径 150 的内侧弧带）：沿弧画一段粗弧线
    g.lineStyle(14, PALETTE.wood, 1);
    g.beginPath();
    g.arc(20, 20, 150, 0, Math.PI / 2, false);
    g.strokePath();
    g.lineStyle(3, darken(PALETTE.wood, 0.4), 1);
    g.beginPath();
    g.arc(20, 20, 157, 0, Math.PI / 2, false);
    g.strokePath();
    g.beginPath();
    g.arc(20, 20, 143, 0, Math.PI / 2, false);
    g.strokePath();
  });
  buildTexture(scene, TEX_KEYS.SEESAW, 368, 48, (g) => {
    block(g, 4, 4, 360, 14, PALETTE.wood, 6);
    // 中心支点三角
    g.fillStyle(PALETTE.metalGray, 1);
    g.fillTriangle(172, 46, 196, 46, 184, 18);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.metalGray, 0.4), 1);
    g.strokeTriangle(172, 46, 196, 46, 184, 18);
  });

  // ---- 传动类 ----
  buildTexture(scene, TEX_KEYS.MOTOR, 116, 116, (g) => {
    // 底座方壳 + 半露轮盘 + 闪电标
    block(g, 4, 60, 108, 52, PALETTE.techBlue);
    disc(g, 58, 58, 44, PALETTE.metalGray);
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillCircle(58, 58, 14);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.4), 1);
    g.strokeCircle(58, 58, 14);
  });
  gearTexture(scene, TEX_KEYS.GEAR_LARGE, 90, PALETTE.metalGray);
  gearTexture(scene, TEX_KEYS.GEAR_MIDDLE, 60, PALETTE.techBlue);
  gearTexture(scene, TEX_KEYS.GEAR_SMALL, 40, PALETTE.accentOrange);
  buildTexture(scene, TEX_KEYS.RACK, 208, 32, (g) => {
    block(g, 4, 4, 200, 24, PALETTE.metalGray, 4);
    // 齿牙：一排小方齿
    g.fillStyle(darken(PALETTE.metalGray, 0.15), 1);
    for (let i = 0; i < 10; i++) {
      g.fillRect(8 + i * 20, 4, 12, 8);
    }
  });
  buildTexture(scene, TEX_KEYS.CONVEYOR, 268, 38, (g) => {
    block(g, 4, 4, 260, 30, PALETTE.darkGray, 4);
    // 两端滚轮 + 中带箭头（方向提示，渲染层按 dir 翻转贴图）
    disc(g, 26, 19, 12, PALETTE.metalGray, false);
    disc(g, 242, 19, 12, PALETTE.metalGray, false);
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillTriangle(120, 26, 150, 26, 135, 12);
  });
  buildTexture(scene, TEX_KEYS.PULLEY, 106, 106, (g) => {
    disc(g, 53, 53, 45, PALETTE.wood);
    // 绳槽（深色环）
    g.lineStyle(4, darken(PALETTE.wood, 0.55), 1);
    g.strokeCircle(53, 53, 32);
  });
  buildTexture(scene, TEX_KEYS.CAM, 116, 116, (g) => {
    // 蛋形凸轮：大圆 + 偏置小圆鼓包
    g.fillStyle(PALETTE.metalGray, 1);
    g.fillCircle(58, 62, 40);
    g.fillCircle(72, 42, 24);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.metalGray, 0.4), 1);
    g.strokeCircle(58, 62, 40);
    g.strokeCircle(72, 42, 24);
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(58, 62, 5);
  });
  buildTexture(scene, TEX_KEYS.TURNTABLE, 236, 236, (g) => {
    disc(g, 118, 118, 110, PALETTE.wood);
    // 同心饰环
    g.lineStyle(3, darken(PALETTE.wood, 0.4), 1);
    g.strokeCircle(118, 118, 78);
  });
  buildTexture(scene, TEX_KEYS.ROPE_LINK, 20, 38, (g) => {
    block(g, 5, 3, 10, 32, darken(PALETTE.wood, 0.15), 5);
  });

  // ---- 能源/触发类 ----
  buildTexture(scene, TEX_KEYS.CANDLE, 44, 102, (g) => {
    // 蜡烛柱（条纹）
    block(g, 10, 30, 24, 68, PALETTE.creamWhite, 6);
    g.fillStyle(PALETTE.cherryRed, 0.5);
    g.fillRect(10, 44, 24, 8);
    g.fillRect(10, 66, 24, 8);
    // 烛芯与火苗
    g.lineStyle(3, PALETTE.outline, 1);
    g.lineBetween(22, 30, 22, 22);
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillEllipse(22, 14, 14, 20);
    g.fillStyle(PALETTE.highlightWhite, 0.85);
    g.fillEllipse(22, 16, 6, 10);
  });
  buildTexture(scene, TEX_KEYS.SPRING_LAUNCHER, 88, 54, (g) => {
    // 底座 + 弹簧圈 + 顶板
    block(g, 14, 34, 60, 16, PALETTE.techBlue, 6);
    g.lineStyle(4, PALETTE.metalGray, 1);
    for (let i = 0; i < 3; i++) {
      g.strokeRoundedRect(26 + i * 3, 18 + i * 4, 36 - i * 6, 6, 3);
    }
    block(g, 14, 8, 60, 12, PALETTE.metalGray, 5);
  });
  buildTexture(scene, TEX_KEYS.BOMB, 58, 58, (g) => {
    disc(g, 29, 33, 22, PALETTE.darkGray, false);
    // 引信 + 火花
    g.lineStyle(3, PALETTE.outline, 1);
    g.lineBetween(29, 11, 36, 5);
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillCircle(38, 5, 4);
    // 礼花标（安全化：星形点缀替代危险符号）
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillCircle(22, 26, 3);
    g.fillCircle(36, 40, 3);
  });
  buildTexture(scene, TEX_KEYS.ROCKET, 36, 68, (g) => {
    // 箭体 + 头锥 + 尾翼
    block(g, 10, 16, 16, 40, PALETTE.highlightWhite, 7);
    g.fillStyle(PALETTE.cherryRed, 1);
    g.fillTriangle(10, 18, 26, 18, 18, 2);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.cherryRed, 0.4), 1);
    g.strokeTriangle(10, 18, 26, 18, 18, 2);
    g.fillStyle(PALETTE.techBlue, 1);
    g.fillTriangle(10, 56, 18, 44, 18, 60);
    g.fillTriangle(26, 56, 18, 44, 18, 60);
    // 尾焰口
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillEllipse(18, 60, 10, 6);
  });
  buildTexture(scene, TEX_KEYS.PRESS_SWITCH, 98, 38, (g) => {
    block(g, 4, 18, 90, 16, PALETTE.metalGray, 5);
    // 红色按压帽
    block(g, 24, 4, 50, 16, PALETTE.cherryRed, 7);
  });
  buildTexture(scene, TEX_KEYS.RECEIVER, 68, 78, (g) => {
    block(g, 6, 20, 56, 54, PALETTE.techBlue);
    // 信号灯座（灯珠由渲染层按通道电平点亮）
    g.fillStyle(PALETTE.creamWhite, 1);
    g.fillCircle(34, 40, 10);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.techBlue, 0.4), 1);
    g.strokeCircle(34, 40, 10);
    // 天线
    g.lineStyle(3, PALETTE.outline, 1);
    g.lineBetween(52, 22, 60, 6);
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillCircle(60, 5, 3.5);
  });

  // ---- 特殊类 ----
  buildTexture(scene, TEX_KEYS.FAN, 128, 128, (g) => {
    // 方壳 + 三叶扇 + 护网圈
    block(g, 4, 4, 120, 120, PALETTE.techBlue, 18);
    g.fillStyle(PALETTE.creamWhite, 1);
    g.fillCircle(64, 64, 44);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.techBlue, 0.4), 1);
    g.strokeCircle(64, 64, 44);
    g.fillStyle(PALETTE.metalGray, 1);
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translateCanvas(64, 64);
      g.rotateCanvas((Math.PI * 2 * i) / 3);
      g.fillEllipse(0, -22, 18, 34);
      g.restore();
    }
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(64, 64, 6);
  });
  buildTexture(scene, TEX_KEYS.MAGNET, 98, 98, (g) => {
    // U 形磁铁：红色 U + 银白极靴（蓝红端标 N/S）
    g.lineStyle(22, PALETTE.cherryRed, 1);
    g.beginPath();
    g.arc(49, 42, 28, Math.PI, 0, false);
    g.strokePath();
    g.lineStyle(22, PALETTE.cherryRed, 1);
    g.lineBetween(21, 42, 21, 78);
    g.lineBetween(77, 42, 77, 78);
    g.fillStyle(PALETTE.metalGray, 1);
    g.fillRect(10, 76, 22, 14);
    g.fillRect(66, 76, 22, 14);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.cherryRed, 0.4), 1);
    g.strokeRect(10, 76, 22, 14);
    g.strokeRect(66, 76, 22, 14);
  });
  buildTexture(scene, TEX_KEYS.BALLOON, 56, 76, (g) => {
    // 气球体 + 高光 + 尾绳
    g.fillStyle(PALETTE.cherryRed, 1);
    g.fillEllipse(28, 30, 44, 54);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.cherryRed, 0.4), 1);
    g.strokeEllipse(28, 30, 44, 54);
    g.fillStyle(PALETTE.highlightWhite, 0.5);
    g.fillEllipse(18, 18, 12, 18);
    g.lineStyle(2, PALETTE.outline, 1);
    g.lineBetween(28, 58, 28, 72);
  });
  buildTexture(scene, TEX_KEYS.HAMSTER, 60, 60, (g) => {
    // 圆身 + 耳朵 + 眼睛（吉祥物咕噜）
    g.fillStyle(PALETTE.wood, 1);
    g.fillCircle(30, 32, 24);
    g.fillCircle(16, 12, 8);
    g.fillCircle(44, 12, 8);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.wood, 0.4), 1);
    g.strokeCircle(30, 32, 24);
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(22, 28, 3);
    g.fillCircle(38, 28, 3);
    g.fillStyle(PALETTE.cherryRed, 1);
    g.fillCircle(30, 38, 2.5);
  });

  // ---- 目标物 ----
  buildTexture(scene, TEX_KEYS.BALLOON_TARGET, 72, 86, (g) => {
    // 立杆 + 大气球（靶心高亮圈）
    g.lineStyle(4, PALETTE.outline, 1);
    g.lineBetween(36, 50, 36, 82);
    g.fillStyle(PALETTE.grassGreen, 1);
    g.fillEllipse(36, 30, 44, 52);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.grassGreen, 0.4), 1);
    g.strokeEllipse(36, 30, 44, 52);
    g.fillStyle(PALETTE.highlightWhite, 1);
    g.fillCircle(36, 30, 8);
  });
  buildTexture(scene, TEX_KEYS.BELL, 68, 78, (g) => {
    // 钟体 + 钟舌 + 吊环
    g.fillStyle(PALETTE.accentOrange, 1);
    g.fillEllipse(34, 36, 48, 52);
    g.fillRect(12, 56, 44, 8);
    g.lineStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.4), 1);
    g.strokeEllipse(34, 36, 48, 52);
    g.strokeRect(12, 56, 44, 8);
    g.fillStyle(PALETTE.outline, 1);
    g.fillCircle(34, 70, 6);
    g.fillStyle(PALETTE.highlightWhite, 0.45);
    g.fillEllipse(24, 24, 10, 16);
  });
  buildTexture(scene, TEX_KEYS.FEED_BOWL, 128, 96, (g) => {
    // 碗体（梯形近似：宽圆角矩 + 碗口沿）
    block(g, 12, 28, 104, 56, PALETTE.accentOrange, 18);
    block(g, 6, 18, 116, 18, darken(PALETTE.accentOrange, 0.15), 9);
    // 粮食点缀
    g.fillStyle(PALETTE.wood, 1);
    g.fillCircle(48, 24, 4);
    g.fillCircle(64, 22, 4);
    g.fillCircle(80, 24, 4);
  });
}

/** 按指定半径画标准圆球（球体家族复用 drawBall 的核心，供变体半径不同时使用） */
function drawBallRadius(g: Phaser.GameObjects.Graphics, radius: number, fill: number): void {
  const pad = TEXTURE_PADDING;
  const c = radius + pad;
  g.fillStyle(fill, fill === PALETTE.highlightWhite ? 1 : 1);
  g.fillCircle(c, c, radius);
  g.lineStyle(STROKE_WIDTH, darken(fill, 0.4), 1);
  g.strokeCircle(c, c, radius);
  g.fillStyle(fill === PALETTE.highlightWhite ? darken(fill, 0.12) : PALETTE.highlightWhite, 0.55);
  g.fillEllipse(c - radius * 0.35, c - radius * 0.4, radius * 0.5, radius * 0.32);
}
