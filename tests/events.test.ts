/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: events.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 事件总线单测 —— 分发/多播/退订/去重/静默语义
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { SimEmitter } from '../src/engine/events';

/** 测试专用事件表（与生产 SimEventMap 解耦，验证泛型能力本身）；
 *  用 type 而非 interface：interface 无隐式索引签名，不满足 Record<string, unknown> 约束 */
type TestEvents = {
  ping: { n: number };
  done: string;
};

describe('SimEmitter 事件总线', () => {
  it('on/emit 按事件名分发强类型 payload', () => {
    const bus = new SimEmitter<TestEvents>();
    let got = 0;
    bus.on('ping', (p) => {
      got = p.n;
    });
    bus.emit('ping', { n: 42 });
    expect(got).toBe(42);
  });

  it('同一事件多个处理器都收到；listenerCount 计数正确', () => {
    const bus = new SimEmitter<TestEvents>();
    let a = 0;
    let b = 0;
    bus.on('ping', () => {
      a++;
    });
    bus.on('ping', () => {
      b++;
    });
    expect(bus.listenerCount('ping')).toBe(2);
    bus.emit('ping', { n: 1 });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('off 取消订阅后不再收到', () => {
    const bus = new SimEmitter<TestEvents>();
    let count = 0;
    const handler = () => {
      count++;
    };
    bus.on('ping', handler);
    bus.emit('ping', { n: 1 });
    bus.off('ping', handler);
    bus.emit('ping', { n: 2 });
    expect(count).toBe(1);
  });

  it('无订阅者 emit 静默不抛错；重复 on 同一函数按 Set 去重', () => {
    const bus = new SimEmitter<TestEvents>();
    expect(() => bus.emit('done', 'x')).not.toThrow();
    const handler = () => undefined;
    bus.on('ping', handler);
    bus.on('ping', handler);
    expect(bus.listenerCount('ping')).toBe(1);
  });
});
