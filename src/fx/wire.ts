/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: wire.ts
 * -----------------------------------------------------------------------------
 * 用途: 模拟引擎事件 → 音效/粒子 的统一接线（闯关/沙盒/实验场/编辑器共用）
 *       订阅 bodiesCollided/explosion/propPopped/countdownTick，
 *       驱动 SoundKit 与 FXLayer。场景只需一行 wireSimFX(...)。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { SimulationEngine } from '../engine/SimulationEngine';
import { SoundKit } from './SoundKit';
import type { FXLayer } from './Particles';

/**
 * 把模拟引擎事件接到音效与粒子层
 * @param scene 宿主场景（粒子与定时器挂在它身上）
 * @param sim 模拟引擎
 * @param fx 粒子层
 */
export function wireSimFX(scene: Phaser.Scene, sim: SimulationEngine, fx: FXLayer): void {
  const sound = SoundKit.get();

  sim.events.on('bodiesCollided', ({ aPid, speed }) => {
    sound.impact(speed, scene.time.now);
    if (speed > 5) {
      const a = sim.getProp(aPid);
      if (a) fx.spark(a.body.position.x, a.body.position.y, (speed - 5) / 6);
    }
  });

  sim.events.on('explosion', ({ x, y }) => {
    sound.explosion();
    fx.explosionBurst(x, y);
  });

  sim.events.on('propPopped', ({ pid }) => {
    sound.pop();
    const prop = sim.getProp(pid);
    if (prop) fx.popBurst(prop.body.position.x, prop.body.position.y, PALETTE_GRASS);
  });

  sim.events.on('countdownTick', ({ remainingSeconds }) => {
    sound.tick(remainingSeconds <= 1);
  });
}

/** popBurst 默认色（避免循环依赖引入 PALETTE 全量） */
const PALETTE_GRASS = 0x7cb342;
