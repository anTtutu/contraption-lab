/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: ChapterScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 章节关卡选择页 —— 6 关卡片 + 星标 + 解锁链（前一关通关解锁下一关）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { chapterLevels, CHAPTERS } from '../level/levelIndex';
import type { ProgressStore } from '../level/ProgressStore';

/** 关卡卡片尺寸 */
const CARD_W = 150;
const CARD_H = 130;

/** 场景启动参数 */
export interface ChapterSceneData {
  chapter: number;
}

export class ChapterScene extends Phaser.Scene {
  private chapter = 1;
  private progress!: ProgressStore;

  constructor() {
    super(SCENE_KEYS.CHAPTER);
  }

  init(data: ChapterSceneData): void {
    // 防御：chapter 0/越界（如用户关卡误入）一律回落第 1 章，防 CHAPTERS[-1] 崩溃黑屏
    const ch = data?.chapter ?? 1;
    this.chapter = ch >= 1 && ch <= CHAPTERS.length ? ch : 1;
  }

  create(): void {
    this.progress = this.registry.get('progress') as ProgressStore;
    const meta = CHAPTERS[this.chapter - 1];
    const cx = this.scale.width / 2;

    // 标题区
    this.add
      .text(cx, 60, `第 ${this.chapter} 章 · ${meta.title}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: 'bold',
        color: `#${PALETTE.outline.toString(16)}`,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 100, `知识点：${meta.concept}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: `#${PALETTE.darkGray.toString(16)}`,
      })
      .setOrigin(0.5);

    this.renderLevelCards();

    // 知识卡按钮（右上；📖 弹窗展示本章物理概念——§6.1 教育完整度）
    this.add
      .rectangle(1150, 44, 130, 48, PALETTE.accentOrange)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showKnowledgeCard(meta));
    this.add.text(1150, 44, '📖 知识卡', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#FFFFFF' }).setOrigin(0.5);

    // 返回主页
    this.add
      .rectangle(80, 40, 110, 48, PALETTE.metalGray)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.metalGray, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start(SCENE_KEYS.HOME));
    this.add.text(80, 40, '↩ 主页', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#FFFFFF' }).setOrigin(0.5);
  }

  /** 6 张关卡卡片：星级 + 解锁链 */
  private renderLevelCards(): void {
    const levels = chapterLevels(this.chapter);
    const totalW = levels.length * (CARD_W + 28);
    let x = this.scale.width / 2 - totalW / 2 + CARD_W / 2 + 14;
    const y = 320;
    let prevCleared = true; // 第 1 关始终解锁
    for (const level of levels) {
      const prog = this.progress.get(level.id);
      const cleared = (prog?.stars ?? 0) > 0;
      const unlocked = prevCleared;
      const cardColor = unlocked ? PALETTE.techBlue : PALETTE.metalGray;

      const card = this.add
        .rectangle(x, y, CARD_W, CARD_H, cardColor)
        .setStrokeStyle(STROKE_WIDTH, darken(cardColor, 0.4));
      if (unlocked) {
        card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.scene.start(SCENE_KEYS.LEVEL, { levelId: level.id });
        });
      }

      this.add
        .text(x, y - 30, unlocked ? level.name : '🔒', {
          fontFamily: FONT_FAMILY,
          fontSize: '19px',
          fontStyle: 'bold',
          color: '#FFFFFF',
          align: 'center',
          wordWrap: { width: CARD_W - 20 },
        })
        .setOrigin(0.5);

      // 星标（获得几星亮几颗）
      const stars = prog?.stars ?? 0;
      this.add
        .text(x, y + 22, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: stars > 0 ? `#${PALETTE.accentOrange.toString(16)}` : `#${PALETTE.creamWhite.toString(16)}`,
        })
        .setOrigin(0.5);

      this.add
        .text(x, y + CARD_H / 2 - 18, level.id, {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: `#${PALETTE.creamWhite.toString(16)}`,
        })
        .setOrigin(0.5);

      prevCleared = cleared;
      x += CARD_W + 28;
    }

    // 未通关引导
    this.add
      .text(this.scale.width / 2, 520, '通关一章即可解锁沙盒实验室！', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: `#${PALETTE.darkGray.toString(16)}`,
      })
      .setOrigin(0.5);
  }

  /** 知识卡弹窗：本章物理概念图文（点任意处关闭） */
  private showKnowledgeCard(meta: { chapter: number; title: string; card: string[] }): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const overlay = this.add.container(0, 0).setDepth(100);
    overlay.add(this.add.rectangle(cx, cy, 1280, 720, 0x000000, 0.5));
    overlay.add(
      this.add
        .rectangle(cx, cy, 620, 460, PALETTE.creamWhite)
        .setStrokeStyle(3, darken(PALETTE.accentOrange, 0.2)),
    );
    overlay.add(
      this.add
        .text(cx, cy - 170, `📖 知识卡 · 第 ${meta.chapter} 章`, {
          fontFamily: FONT_FAMILY,
          fontSize: '24px',
          fontStyle: 'bold',
          color: `#${PALETTE.techBlue.toString(16)}`,
        })
        .setOrigin(0.5),
    );
    meta.card.forEach((line, i) => {
      overlay.add(
        this.add
          .text(cx, cy - 105 + i * 62, line, {
            fontFamily: FONT_FAMILY,
            fontSize: '17px',
            color: `#${PALETTE.outline.toString(16)}`,
            align: 'center',
            wordWrap: { width: 560 },
          })
          .setOrigin(0.5),
      );
    });
    const close = this.add.rectangle(cx, cy + 180, 160, 48, PALETTE.techBlue).setInteractive({ useHandCursor: true });
    overlay.add(close);
    overlay.add(this.add.text(cx, cy + 180, '知道啦！', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#FFF' }).setOrigin(0.5));
    // 点遮罩任意处关闭
    const bg = overlay.list[0] as Phaser.GameObjects.Rectangle;
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => overlay.destroy(true));
    close.on('pointerdown', () => overlay.destroy(true));
  }
}
