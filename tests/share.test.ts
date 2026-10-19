/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: share.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 测试用例
 * 作者: Anttu
 * 创建日期: 2026-10-19
 * =============================================================================
 */
/**
 * 分享文件格式单测：.clab 编码/解析/损坏检测
 */
import { describe, it, expect } from 'vitest';
import { encodeClab, parseClab, checksum } from '../src/editor/share';
import type { LevelDoc } from '../src/level/types';

const DOC: LevelDoc = {
  version: 2,
  id: 'u-abc',
  source: 'user',
  name: '分享测试',
  chapter: 0,
  scene: { width: 1280, height: 720 },
  fixed: [{ pid: 'p1', type: 'plank', x: 100, y: 100 }],
  inventory: [{ type: 'plank', count: 1 }],
  goals: [],
  starRule: { maxParts: 1 },
  hints: { text: 'hi' },
};

describe('share.ts .clab 格式', () => {
  it('编码后可无损解析回原关卡', () => {
    const parsed = parseClab(encodeClab(DOC));
    expect(parsed).toEqual(DOC);
  });

  it('校验和：内容篡改后被拒绝', () => {
    const raw = encodeClab(DOC);
    const tampered = raw.replace('"分享测试"', '"坏数据"');
    expect(() => parseClab(tampered)).toThrow(/损坏/);
  });

  it('非 .clab 内容被拒绝', () => {
    expect(() => parseClab('{"hello":"world"}')).toThrow(/\.clab/);
    expect(() => parseClab('not json')).toThrow(/JSON/);
  });

  it('校验和稳定且区分输入', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});
