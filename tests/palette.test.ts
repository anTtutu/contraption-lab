/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: palette.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 调色板规范守护测试 —— 锁死「恰好 12 色、无重复、合法色值」三条规范，
 *       任何人改动 PALETTE 导致超标会直接挂测试。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_SIZE, STROKE_WIDTH, FONT_FAMILY } from '../src/core/palette';

describe('palette.ts 调色板规范', () => {
  it('调色板恰好 12 色（设计文档 §4.2 硬性规范）', () => {
    expect(Object.keys(PALETTE).length).toBe(PALETTE_SIZE);
    expect(PALETTE_SIZE).toBe(12);
  });

  it('所有色值都是合法 24bit 整数且互不重复', () => {
    const values = Object.values(PALETTE);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0x000000);
      expect(v).toBeLessThanOrEqual(0xffffff);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('统一描边宽度为 2.5px（卡通 30% 规范值）', () => {
    expect(STROKE_WIDTH).toBe(2.5);
  });

  it('字体栈包含中文圆体优先配置', () => {
    expect(FONT_FAMILY).toContain('PingFang SC');
  });
});
