/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: PropsMechanics.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 机构机制机制级单测（步骤 3 验收）：
 *       电机定速 / 齿轮联动比 / 传送带 / 跷跷板杠杆 / 风扇 / 浮力 / 磁铁 /
 *       信号通道 / 炸弹引爆 / 绳索烧断 / 篮筐接球 / 气球靶爆裂 —— 全物理裸跑。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/engine/SimulationEngine';
import { PropEntry } from '../src/engine/PropBase';
import { RotatingDiscProp } from '../src/engine/props/RotatingDiscProp';
import { RopeProp } from '../src/engine/props/RopeProp';

/** 构造沙盒引擎并直接起跑（无倒计时） */
function bootSandbox(entries: PropEntry[]): SimulationEngine {
  const engine = new SimulationEngine({ mode: 'sandbox', timeoutMs: 60_000 });
  engine.loadProps(entries);
  engine.start();
  return engine;
}

/** 连续步进 n 步 */
function runSteps(engine: SimulationEngine, n: number): void {
  for (let i = 0; i < n; i++) engine.step();
}

describe('机构机制（步骤 3）', () => {
  it('电机：恒速输出（2 档 ≈ 0.06 rad/步）', () => {
    const e = bootSandbox([{ pid: 'm1', type: 'motor', x: 640, y: 300 }]);
    runSteps(e, 20);
    const motor = e.getProp('m1') as RotatingDiscProp;
    expect(Math.abs(motor.currentOmega)).toBeCloseTo(0.06, 5);
  });

  it('齿轮联动：与电机啮合的中齿轮按半径比反向转动', () => {
    const e = bootSandbox([
      { pid: 'm1', type: 'motor', x: 400, y: 300 }, // r=50, ω=+0.06
      { pid: 'g1', type: 'gear', x: 510, y: 300 },  // r=60, 中心距 110 = 50+60 ✓ 啮合
    ]);
    runSteps(e, 5);
    const gear = e.getProp('g1') as RotatingDiscProp;
    expect(gear.currentOmega).toBeCloseTo(-0.06 * (50 / 60), 5);
  });

  it('传送带：把带上的球往带速方向送', () => {
    const e = bootSandbox([
      { pid: 'cv', type: 'conveyor', x: 640, y: 500, meta: { dir: 1, speed: 3 } },
      { pid: 'b1', type: 'ball', x: 640, y: 459 }, // 落在带面（顶面 485）上
    ]);
    runSteps(e, 40);
    expect(e.getProp('b1')!.body.velocity.x).toBeGreaterThan(2);
  });

  it('跷跷板：钢球压右端使板向右下倾斜', () => {
    const e = bootSandbox([
      { pid: 'sw', type: 'seesaw', x: 640, y: 400 },
      { pid: 'b1', type: 'ball', x: 760, y: 320, variant: 'steel' },
    ]);
    runSteps(e, 150);
    expect(e.getProp('sw')!.body.angle).toBeGreaterThan(0.02);
  });

  it('风扇：把乒乓球往风向吹走', () => {
    const e = bootSandbox([
      { pid: 'f1', type: 'fan', x: 400, y: 300, meta: { dir: 0, power: 3 } },
      { pid: 'b1', type: 'ball', x: 520, y: 300, variant: 'pingpong' },
    ]);
    runSteps(e, 60);
    expect(e.getProp('b1')!.body.position.x).toBeGreaterThan(560);
  });

  it('氦气球：持续上升', () => {
    const e = bootSandbox([{ pid: 'bl', type: 'balloon', x: 640, y: 400 }]);
    runSteps(e, 60);
    const balloon = e.getProp('bl')!;
    expect(balloon.body.velocity.y).toBeLessThan(0);
    expect(balloon.body.position.y).toBeLessThan(400);
  });

  it('磁铁：吸引冰面上的钢球横向靠近', () => {
    const e = bootSandbox([
      { pid: 'mg', type: 'magnet', x: 640, y: 300 },
      { pid: 'ice', type: 'iceBlock', x: 760, y: 336 }, // 托面：防止钢球自由落体逃出吸引半径
      { pid: 'b1', type: 'ball', x: 760, y: 290, variant: 'steel' },
    ]);
    runSteps(e, 100);
    const dist = Math.hypot(e.getProp('b1')!.body.position.x - 640, e.getProp('b1')!.body.position.y - 300);
    expect(dist).toBeLessThan(130);
  });

  it('信号通道：球压开关 → 通道接通', () => {
    const e = bootSandbox([
      { pid: 'ps', type: 'pressSwitch', x: 640, y: 500, meta: { channel: 'red' } },
      { pid: 'b1', type: 'ball', x: 640, y: 420, variant: 'steel' },
    ]);
    runSteps(e, 120);
    expect(e.channels.get('red')).toBe(true);
  });

  it('礼花炸弹：受击引信 1.5s 后爆炸并自移除', () => {
    // 炸弹为动态体：静态摆放（关卡常见手法），否则与来球同步自由落体永不碰撞
    const e = bootSandbox([
      { pid: 'bm', type: 'bomb', x: 640, y: 500, isStatic: true },
      { pid: 'b1', type: 'ball', x: 640, y: 380, variant: 'bowling' },
    ]);
    let exploded = false;
    e.events.on('explosion', () => {
      exploded = true;
    });
    runSteps(e, 250);
    expect(exploded).toBe(true);
    expect(e.getProp('bm')).toBeUndefined();
  });

  it('可燃绳 + 蜡烛：火焰邻近点燃，延时后烧断', () => {
    const e = bootSandbox([
      { pid: 'rp', type: 'rope', x: 640, y: 310, meta: { points: [{ x: 640, y: 200 }, { x: 640, y: 420 }] } },
      { pid: 'cd', type: 'candle', x: 662, y: 300 }, // 火焰点 (662,260) 距绳锚 (640,200) ≈ 64 < 90
    ]);
    runSteps(e, 120);
    const rope = e.getProp('rp') as RopeProp;
    expect(rope.isBurned).toBe(true);
  });

  it('篮筐：球落进筐内被接住', () => {
    const e = bootSandbox([
      { pid: 'bk', type: 'basket', x: 700, y: 560 },
      { pid: 'b1', type: 'ball', x: 700, y: 420 },
    ]);
    runSteps(e, 150);
    const ball = e.getProp('b1')!.body;
    expect(ball.position.x).toBeGreaterThan(640);
    expect(ball.position.x).toBeLessThan(760);
    expect(ball.position.y).toBeGreaterThan(500);
  });

  it('气球靶：被运动体触碰即爆（propPopped + 移除）', () => {
    const e = bootSandbox([
      { pid: 'bt', type: 'balloonTarget', x: 640, y: 400 },
      { pid: 'b1', type: 'ball', x: 640, y: 200 },
    ]);
    let poppedPid = '';
    e.events.on('propPopped', (p) => {
      poppedPid = p.pid;
    });
    runSteps(e, 40); // 球需约 23 步才落到靶圈
    expect(poppedPid).toBe('bt');
    expect(e.getProp('bt')).toBeUndefined();
  });

  it('火箭：起跑后向上推进', () => {
    const e = bootSandbox([{ pid: 'rk', type: 'rocket', x: 640, y: 500 }]);
    runSteps(e, 100);
    expect(e.getProp('rk')!.body.position.y).toBeLessThan(460);
  });
});
