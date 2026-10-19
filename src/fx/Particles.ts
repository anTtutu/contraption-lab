/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: Particles.ts
 * -----------------------------------------------------------------------------
 * 用途: 轻量粒子特效层（设计文档 §4.3 动效三件套 + §9）
 *       - spark：撞击星尘（小圆点四溅）
 *       - confetti：通关彩带雨（多彩矩形飘落）
 *       - pop：气球爆裂碎片
 *       基于 Phaser 3.60+ 粒子 API；纹理为程序化小图（TextureFactory 生成）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE } from '../core/palette';

/** 彩带色板（从全局调色板取点缀色） */
const CONFETTI_COLORS = [PALETTE.techBlue, PALETTE.accentOrange, PALETTE.grassGreen, PALETTE.cherryRed, PALETTE.metalGray];

export class FXLayer {
  constructor(private readonly scene: Phaser.Scene) {}

  /** 撞击星尘：在 (x,y) 处四溅 4-6 颗小点 */
  spark(x: number, y: number, strength = 1): void {
    const count = Math.min(8, 3 + Math.floor(strength * 2));
    const emitter = this.scene.add.particles(x, y, 'fx.spark', {
      speed: { min: 40, max: 60 + strength * 40 },
      angle: { min: 0, max: 360 },
      lifespan: 320,
      scale: { start: 1, end: 0 },
      quantity: count,
      tint: PALETTE.highlightWhite,
      emitting: false,
    });
    emitter.setDepth(50);
    emitter.explode(count);
    this.scene.time.delayedCall(600, () => emitter.destroy());
  }

  /** 气球爆裂碎片：彩色小片放射 */
  popBurst(x: number, y: number, color: number): void {
    const emitter = this.scene.add.particles(x, y, 'fx.rect', {
      speed: { min: 80, max: 200 },
      angle: { min: 0, max: 360 },
      lifespan: 500,
      scale: { start: 1.2, end: 0.2 },
      rotate: { min: 0, max: 360 },
      quantity: 12,
      tint: color,
      emitting: false,
    });
    emitter.setDepth(50);
    emitter.explode(12);
    this.scene.time.delayedCall(800, () => emitter.destroy());
  }

  /** 爆炸彩带：大范围彩色喷发（礼花炸弹） */
  explosionBurst(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const emitter = this.scene.add.particles(x, y, 'fx.rect', {
        speed: { min: 120, max: 320 },
        angle: { min: 200, max: 340 }, // 向上喷为主
        lifespan: 900,
        scale: { start: 1.6, end: 0.2 },
        rotate: { min: 0, max: 360 },
        gravityY: 300,
        quantity: 14,
        tint: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        emitting: false,
      });
      emitter.setDepth(50);
      emitter.explode(14);
      this.scene.time.delayedCall(1200, () => emitter.destroy());
    }
  }

  /** 通关彩带雨：全屏顶部飘落 2 秒 */
  confettiRain(): void {
    const emitter = this.scene.add.particles(0, 0, 'fx.rect', {
      x: { min: 0, max: this.scene.scale.width },
      y: -20,
      lifespan: 2200,
      speedY: { min: 120, max: 260 },
      speedX: { min: -60, max: 60 },
      scale: { start: 1.4, end: 0.6 },
      rotate: { min: 0, max: 720 },
      quantity: 3,
      frequency: 28,
      tint: CONFETTI_COLORS,
      emitting: true,
    });
    emitter.setDepth(90);
    this.scene.time.delayedCall(2000, () => {
      emitter.stop();
      this.scene.time.delayedCall(2400, () => emitter.destroy());
    });
  }
}
