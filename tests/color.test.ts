/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: color.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 颜色工具纯函数单测 —— 保证「描边自动加深 40%」等派色规则可靠
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { mixColor, darken, lighten, toCss } from '../src/core/color';

describe('color.ts 颜色工具', () => {
  it('mixColor：黑白中点混合得 0x808080（round 对称）', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('mixColor：t=0 返回 c1，t=1 返回 c2', () => {
    expect(mixColor(0x112233, 0xaabbcc, 0)).toBe(0x112233);
    expect(mixColor(0x112233, 0xaabbcc, 1)).toBe(0xaabbcc);
  });

  it('mixColor：t 越界必须抛错（防调用方传错比例）', () => {
    expect(() => mixColor(0x000000, 0xffffff, -0.1)).toThrow();
    expect(() => mixColor(0x000000, 0xffffff, 1.5)).toThrow();
  });

  it('darken：白色加深 40% 得 0x999999（描边派色基准用例）', () => {
    expect(darken(0xffffff, 0.4)).toBe(0x999999);
  });

  it('lighten：黑色提亮 50% 得 0x808080', () => {
    expect(lighten(0x000000, 0.5)).toBe(0x808080);
  });

  it('toCss：输出大写 #RRGGBB 六位十六进制', () => {
    expect(toCss(0x4a90d9)).toBe('#4A90D9');
    // 低两位为 0 时也必须补齐六位（padStart 覆盖）
    expect(toCss(0x000000)).toBe('#000000');
  });
});
