/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: BootScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 启动场景 —— 游戏入口第一屏
 *       职责：1) 播放极简加载动画（本作无外部素材，程序化生成近似瞬时，
 *                进度条为体感缓冲，避免「闪一下就跳页」的生硬感）
 *            2) 调用 TextureFactory.generateAll 程序化生成全部基础纹理
 *            3) 完成后跳转主页
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { generateAll } from '../core/TextureFactory';
import { DbService } from '../db/DbService';
import { bootstrapDatabase } from '../db/bootstrap';
import { ProgressSnapshot } from '../db/ProgressSnapshot';
import { SoundKit } from '../fx/SoundKit';

/** 进度条尺寸常量 */
const BAR_WIDTH = 420;
const BAR_HEIGHT = 24;

export class BootScene extends Phaser.Scene {
  /** 进度条填充画笔（onUpdate 中反复重绘） */
  private barFill!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE_KEYS.BOOT);
  }

  create(): void {
    const cx = this.scale.width / 2;

    // ---- 标题区 ----
    this.add
      .text(cx, 300, '奇妙机关工坊', {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: `#${PALETTE.outline.toString(16)}`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 350, 'Contraption Lab · 正在组装实验室……', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: `#${PALETTE.darkGray.toString(16)}`,
      })
      .setOrigin(0.5);

    // ---- 进度条底框 ----
    const barX = cx - BAR_WIDTH / 2;
    const barY = 420;
    this.add.graphics().lineStyle(STROKE_WIDTH, darken(PALETTE.outline, 0.2), 1).strokeRoundedRect(
      barX,
      barY,
      BAR_WIDTH,
      BAR_HEIGHT,
      BAR_HEIGHT / 2,
    );

    // ---- 进度条填充（橙色，onUpdate 重绘宽度）----
    this.barFill = this.add.graphics();
    this.barFill.fillStyle(PALETTE.accentOrange, 1);

    // ---- 生成全部程序化纹理（同步、快速）----
    generateAll(this);

    // ---- 数据库引导（D16 三级降级链）：与进度动画并行，失败兜底进游戏 ----
    const dbTask = this.bootstrapDb();

    // ---- 体感进度动画：0 → 1，动画与数据库就绪双条件完成后进入主页 ----
    const progress = { value: 0 };
    this.tweens.add({
      targets: progress,
      value: 1,
      duration: 800,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.redrawBar(barX, barY, progress.value),
      onComplete: () => {
        // 数据库最多等 8s（挂了也放行：registry 里的内存进度兜底）
        const timeout = new Promise((r) => this.time.delayedCall(8000, r));
        Promise.race([dbTask, timeout]).then(() => {
          this.time.delayedCall(250, () => this.scene.start(SCENE_KEYS.HOME));
        });
      },
    });
  }

  /**
   * 初始化 SQLite（Worker + OPFS 优先），预载进度快照并写入 registry。
   * 任何失败都不阻断游戏——registry 中已由 main.ts 预置内存进度兜底。
   */
  private async bootstrapDb(): Promise<void> {
    const service = new DbService();
    const repo = await bootstrapDatabase(service);
    const progressMap = await repo.loadProgressMap();
    this.registry.set('db', service);
    this.registry.set('repo', repo);
    this.registry.set('progress', new ProgressSnapshot(repo, progressMap));
    // 恢复静音设置（步骤 8：音效持久化开关）
    const muted = await repo.getSetting('muted');
    if (muted === '1') SoundKit.get().setMuted(true);
    console.info(`[Boot] 数据库就绪，持久化模式: ${service.mode}（${service.initDetail}）`);
  }

  /**
   * 重绘进度条填充
   * @param barX 进度条左上 x
   * @param barY 进度条左上 y
   * @param ratio 进度比例 0~1
   */
  private redrawBar(barX: number, barY: number, ratio: number): void {
    this.barFill.clear();
    this.barFill.fillStyle(PALETTE.accentOrange, 1);
    // 宽度最小 4px，保证圆角头不消失
    const w = Math.max(4, (BAR_WIDTH - STROKE_WIDTH * 2) * ratio);
    this.barFill.fillRoundedRect(
      barX + STROKE_WIDTH,
      barY + STROKE_WIDTH,
      w,
      BAR_HEIGHT - STROKE_WIDTH * 2,
      (BAR_HEIGHT - STROKE_WIDTH * 2) / 2,
    );
  }
}
