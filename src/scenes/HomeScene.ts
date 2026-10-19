/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: HomeScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 主页 —— 章节地图（设计文档 §9.1）
 *       版块：开始闯关（第 1 章入口）｜2-7 章制作中卡片｜沙盒实验室（锁定/解锁）
 *       ｜物理实验场（开发验收入口）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { CHAPTERS } from '../level/levelIndex';
import type { ProgressStore } from '../level/ProgressStore';

export class HomeScene extends Phaser.Scene {
  private progress!: ProgressStore;

  constructor() {
    super(SCENE_KEYS.HOME);
  }

  create(): void {
    this.progress = this.registry.get('progress') as ProgressStore;
    const cx = this.scale.width / 2;

    // ---- 标题区 ----
    this.add
      .text(cx, 60, '奇妙机关工坊', {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        fontStyle: 'bold',
        color: `#${PALETTE.outline.toString(16)}`,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 104, 'Contraption Lab · 拖一拖、搭一搭，看你的机关连转起来！', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: `#${PALETTE.darkGray.toString(16)}`,
      })
      .setOrigin(0.5);

    this.renderChapterCards();
    this.renderSandboxEntry();
    this.renderFooter();
  }

  /** 七章卡片：第 1 章可玩，2-7 章制作中 */
  private renderChapterCards(): void {
    const startY = 190;
    const cardW = 300;
    const cardH = 92;
    const gapX = 40;
    const gapY = 26;
    CHAPTERS.forEach((meta, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = this.scale.width / 2 + (col === 0 ? -1 : 1) * (cardW / 2 + gapX / 2);
      const y = startY + row * (cardH + gapY);
      const ready = meta.ready;

      const color = ready ? PALETTE.grassGreen : PALETTE.metalGray;
      const card = this.add
        .rectangle(x, y, cardW, cardH, color)
        .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4));
      if (ready) {
        card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.scene.start(SCENE_KEYS.CHAPTER, { chapter: meta.chapter });
        });
      }

      this.add
        .text(x, y - 20, ready ? `▶ 第 ${meta.chapter} 章` : `🔒 第 ${meta.chapter} 章`, {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#FFFFFF',
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 12, ready ? meta.title : '制作中', {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: `#${PALETTE.creamWhite.toString(16)}`,
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 32, meta.concept, {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: `#${PALETTE.creamWhite.toString(16)}`,
        })
        .setOrigin(0.5);
    });
  }

  /** 第 8 格：沙盒实验室（第 1 章全通解锁，D13） */
  private renderSandboxEntry(): void {
    const cardW = 300;
    const cardH = 92;
    // 第 8 格位置（4 行 2 列的右列）
    const x = this.scale.width / 2 + (cardW / 2 + 20);
    const y = 190 + 3 * (cardH + 26);

    // 解锁条件：第 1 章 6 关全部通关（当前进度查首关星数聚合）
    const chapter1Cleared = [1, 2, 3, 4, 5, 6].every((i) => (this.progress.get(`L1-0${i}`)?.stars ?? 0) > 0);
    const unlocked = chapter1Cleared;
    const color = unlocked ? PALETTE.accentOrange : PALETTE.metalGray;

    this.add
      .rectangle(x, y, cardW, cardH, color)
      .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4));
    this.add
      .text(x, y - 20, unlocked ? '🧪 沙盒实验室' : '🔒 沙盒实验室', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#FFFFFF',
      })
      .setOrigin(0.5);
    this.add
      .text(x, y + 12, unlocked ? '自由实验，无限道具' : '通关第 1 章解锁', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: `#${PALETTE.creamWhite.toString(16)}`,
      })
      .setOrigin(0.5);
    if (unlocked) {
      // 交互挂在【原有】卡片矩形上（此前叠加新矩形会盖住文字——测试反馈 Bug1）
      this.add
        .rectangle(x, y, cardW, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.scene.start(SCENE_KEYS.SANDBOX));
    }
  }

  /** 页脚：创作入口三连（编辑器 / 我的关卡 / 实验场）+ 版本信息 */
  private renderFooter(): void {
    const cx = this.scale.width / 2;
    const entries: Array<{ label: string; color: number; scene: string }> = [
      { label: '🛠 关卡工坊（编辑器）', color: PALETTE.grassGreen, scene: SCENE_KEYS.EDITOR },
      { label: '🧩 我的关卡', color: PALETTE.techBlue, scene: SCENE_KEYS.MY_LEVELS },
      { label: '🧪 物理实验场', color: PALETTE.metalGray, scene: SCENE_KEYS.ENGINE_LAB },
    ];
    entries.forEach((e, i) => {
      const x = cx + (i - 1) * 290;
      this.add
        .rectangle(x, 640, 270, 46, e.color)
        .setStrokeStyle(STROKE_WIDTH, darken(e.color, 0.4))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.scene.start(e.scene));
      this.add
        .text(x, 640, e.label, { fontFamily: FONT_FAMILY, fontSize: '16px', fontStyle: 'bold', color: `#${PALETTE.highlightWhite.toString(16)}` })
        .setOrigin(0.5);
    });
    this.add
      .text(cx, 692, 'v0.2.0 · 设计文档 v1.0 · 步骤 6：关卡编辑器 + 我的关卡（第 1 章 + 创作模式开放）', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: `#${PALETTE.darkGray.toString(16)}`,
      })
      .setOrigin(0.5);
  }
}
