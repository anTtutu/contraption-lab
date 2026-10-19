/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: starRating.ts
 * -----------------------------------------------------------------------------
 * 用途: 星级计算纯函数（设计文档 §6.2 已拍板三条件）：
 *       ★1 通关 / ★2 道具数不超限额（效率）/ ★3 未使用提示（独立思考）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/**
 * 计算星级
 * @param cleared 是否通关
 * @param partsUsed 本轮使用的道具数
 * @param maxParts ★2 道具数限额（starRule.maxParts）
 * @param usedHint 本轮是否使用过提示
 * @returns 0-3 星
 */
export function computeStars(cleared: boolean, partsUsed: number, maxParts: number, usedHint: boolean): number {
  if (!cleared) return 0;
  let stars = 1;
  if (partsUsed <= maxParts) stars++;
  if (!usedHint) stars++;
  return stars;
}
