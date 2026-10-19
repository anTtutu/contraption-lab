/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: sound.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 音效纯函数单测 —— 包络形状/撞击音量映射/节流门
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { buildEnvelope, impactVolume, ThrottleGate } from '../src/fx/SoundKit';

describe('SoundKit 纯函数', () => {
  it('包络：起步为峰值并指数衰减到接近 0', () => {
    const env = buildEnvelope({ peak: 0.5, decay: 0.1 }, 1000);
    expect(env.length).toBe(100);
    expect(env[0]).toBeCloseTo(0.5, 5);
    expect(env[99]).toBeLessThan(0.5 * 0.05);
  });

  it('撞击音量：速度 4→0.08，20→0.5，越界钳制', () => {
    expect(impactVolume(4)).toBeCloseTo(0.08, 5);
    expect(impactVolume(20)).toBeCloseTo(0.5, 5);
    expect(impactVolume(1)).toBeCloseTo(0.08, 5); // 低于下限钳到 4
    expect(impactVolume(99)).toBeCloseTo(0.5, 5); // 高于上限钳到 20
    expect(impactVolume(12)).toBeCloseTo(0.08 + (8 / 16) * 0.42, 5);
  });

  it('节流门：间隔内拒绝，间隔外放行', () => {
    const gate = new ThrottleGate(100);
    expect(gate.allow(0)).toBe(true);
    expect(gate.allow(50)).toBe(false);
    expect(gate.allow(99)).toBe(false);
    expect(gate.allow(100)).toBe(true);
    expect(gate.allow(150)).toBe(false);
  });
});
