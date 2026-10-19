/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: color.ts
 * -----------------------------------------------------------------------------
 * 用途: 颜色计算纯函数工具（与 Phaser 解耦，可独立单测）
 *       主要服务于「卡通 30%」规范的自动派生色：
 *       描边色 = 材质色加深 40%，高光 = 材质色提亮，无需手工配第二套色。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/**
 * 颜色分量裁剪：限定在 [0, 255] 区间
 * @param value 原始分量值
 * @returns 裁剪后的分量值
 */
function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * 线性混合两个颜色
 * @param c1 颜色 A（0xRRGGBB）
 * @param c2 颜色 B（0xRRGGBB）
 * @param t 混合比例，0 = 完全 A，1 = 完全 B；越界抛错（防止调用方手滑传错）
 * @returns 混合后的颜色（0xRRGGBB）
 */
export function mixColor(c1: number, c2: number, t: number): number {
  if (t < 0 || t > 1) {
    throw new Error(`mixColor 混合比例 t 必须在 [0,1] 区间，收到: ${t}`);
  }
  // 逐通道线性插值后四舍五入（round 而非 floor，保证中点混合结果对称）
  const r = clamp255(((c1 >> 16) & 0xff) * (1 - t) + ((c2 >> 16) & 0xff) * t);
  const g = clamp255(((c1 >> 8) & 0xff) * (1 - t) + ((c2 >> 8) & 0xff) * t);
  const b = clamp255((c1 & 0xff) * (1 - t) + (c2 & 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * 加深颜色（混入黑色）
 * @param color 原色（0xRRGGBB）
 * @param ratio 加深比例 0~1，规范中描边取 0.4
 * @returns 加深后的颜色（0xRRGGBB）
 */
export function darken(color: number, ratio: number): number {
  return mixColor(color, 0x000000, ratio);
}

/**
 * 提亮颜色（混入白色）
 * @param color 原色（0xRRGGBB）
 * @param ratio 提亮比例 0~1
 * @returns 提亮后的颜色（0xRRGGBB）
 */
export function lighten(color: number, ratio: number): number {
  return mixColor(color, 0xffffff, ratio);
}

/**
 * 转为 CSS 十六进制字符串（大写 #RRGGBB）
 * @param color 颜色值（0xRRGGBB）
 * @returns 如 '#4A90D9'，用于 index.html / DOM overlay 等场景
 */
export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
}
