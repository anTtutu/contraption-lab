/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: Registry.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 道具注册表完备性守护 —— 33 类道具全部登记、视图元数据合法
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { PROP_REGISTRY, REGISTERED_TYPES } from '../src/engine/propRegistry';
import { TEX_KEYS } from '../src/core/TextureFactory';

/** 设计文档 §5 全量道具类型清单（33 类 = 38 种道具，球类按变体计数） */
const EXPECTED_TYPES: readonly string[] = [
  'ball', 'balloon', 'hamster',
  'plank', 'shelf', 'pillar', 'wedge', 'iceBlock', 'bouncyPad', 'trampoline', 'curvedTrack', 'seesaw',
  'motor', 'gear', 'pulley', 'cam', 'turntable', 'rack', 'conveyor',
  'rope', 'chain', 'pulleyCompound',
  'candle', 'springLauncher', 'bomb', 'rocket', 'pressSwitch', 'receiver',
  'fan', 'magnet',
  'basket', 'feedBowl', 'balloonTarget', 'bell',
];

describe('propRegistry 道具注册表', () => {
  it('全量道具均已登记（缺一即挂，防止关卡引用悬空类型）', () => {
    for (const type of EXPECTED_TYPES) {
      expect(PROP_REGISTRY[type], `缺少道具类型: ${type}`).toBeDefined();
    }
    expect(REGISTERED_TYPES.length).toBe(EXPECTED_TYPES.length);
  });

  it('viewOf 均返回正尺寸且纹理 Key 已在 TEX_KEYS 登记', () => {
    for (const type of EXPECTED_TYPES) {
      const view = PROP_REGISTRY[type].viewOf({ pid: 't1', type, x: 0, y: 0 });
      expect(view.width, `${type} 宽度非法`).toBeGreaterThan(0);
      expect(view.height, `${type} 高度非法`).toBeGreaterThan(0);
      expect(Object.values(TEX_KEYS), `${type} 纹理未登记: ${view.texture}`).toContain(view.texture);
    }
  });
});
