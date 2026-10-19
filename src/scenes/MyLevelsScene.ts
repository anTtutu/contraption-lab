/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: MyLevelsScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 我的关卡管理页（设计文档 §8.7）：列出用户自创关卡（SQLite），
 *       支持游玩 / 删除；空态引导去编辑器创作。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import type { LevelDoc } from '../level/types';
import type { GameRepository } from '../db/repository';
import type { ProgressStore } from '../level/ProgressStore';
import { encodeClab, parseClab, downloadText, pickTextFile, downloadBytes, pickBinaryFile, mobileShare } from '../editor/share';
import { idbSave } from '../db/idbBackup';
import { DbService } from '../db/DbService';

/** 列表卡片尺寸 */
const CARD_W = 360;
const CARD_H = 96;

export class MyLevelsScene extends Phaser.Scene {
  private repo!: GameRepository;
  /** 进度存储（用户关星级展示用） */
  private progress!: ProgressStore;

  constructor() {
    super(SCENE_KEYS.MY_LEVELS);
  }

  create(): void {
    this.repo = this.registry.get('repo') as GameRepository;
    this.progress = this.registry.get('progress') as ProgressStore;
    const cx = this.scale.width / 2;

    this.add
      .text(cx, 56, '🧩 我的关卡', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` })
      .setOrigin(0.5);

    // 分享游戏（右上；微信/钉钉降级复制链接）
    this.add
      .rectangle(1150, 44, 150, 48, PALETTE.techBlue)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.techBlue, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        void mobileShare('奇妙机关工坊——我做了个关卡，快来玩！', window.location.href).then((r) => {
          if (r !== 'shared') {
            this.add
              .text(cx, 100, r === 'copied' ? '🔗 链接已复制，去粘贴给朋友吧！' : '当前浏览器不支持分享，截图发给朋友吧～', {
                fontFamily: FONT_FAMILY,
                fontSize: '15px',
                color: `#${PALETTE.grassGreen.toString(16)}`,
              })
              .setOrigin(0.5)
              .setDepth(200);
            this.time.delayedCall(2500, () => this.scene.restart());
          }
        });
      });
    this.add.text(1150, 44, '🔗 分享', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#FFF' }).setOrigin(0.5);

    // 返回 / 去创作
    this.add
      .rectangle(90, 44, 110, 48, PALETTE.metalGray)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.metalGray, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start(SCENE_KEYS.HOME));
    this.add.text(90, 44, '↩ 主页', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#FFF' }).setOrigin(0.5);

    this.add
      .rectangle(cx, 640, 420, 52, PALETTE.grassGreen)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.grassGreen, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start(SCENE_KEYS.EDITOR));
    this.add
      .text(cx, 640, '🛠 去编辑器创作新关卡', { fontFamily: FONT_FAMILY, fontSize: '19px', fontStyle: 'bold', color: '#FFF' })
      .setOrigin(0.5);

    // 步骤 9：分享与备份
    this.add
      .rectangle(cx + 330, 640, 150, 52, PALETTE.accentOrange)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => void this.importClab());
    this.add.text(cx + 330, 640, '📥 导入关卡', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5);
    this.add
      .rectangle(cx - 330, 640, 150, 52, PALETTE.metalGray)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.metalGray, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => void this.backupDb());
    this.add.text(cx - 330, 640, '💾 备份存档', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5);
    // 步骤 10：恢复备份（.db 整库回灌 → 立即快照 → 刷新重载）
    this.add
      .rectangle(cx - 500, 640, 150, 52, PALETTE.cherryRed)
      .setStrokeStyle(STROKE_WIDTH, darken(PALETTE.cherryRed, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => void this.restoreDb());
    this.add.text(cx - 500, 640, '📂 恢复备份', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5);

    // 异步加载关卡列表
    void this.repo.listUserLevels().then((docs) => this.renderList(docs));
  }

  /** 渲染关卡卡片（4 列 × 3 行） */
  private renderList(docs: LevelDoc[]): void {
    if (docs.length === 0) {
      this.add
        .text(this.scale.width / 2, 320, '还没有自己的关卡哦～\n点下方按钮去创作第一个吧！', {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
          color: `#${PALETTE.darkGray.toString(16)}`,
          align: 'center',
          lineSpacing: 10,
        })
        .setOrigin(0.5);
      return;
    }
    const perRow = 3;
    docs.slice(0, 9).forEach((doc, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = this.scale.width / 2 + (col - 1) * (CARD_W + 30);
      const y = 190 + row * (CARD_H + 30);

      this.add.rectangle(x, y, CARD_W, CARD_H, PALETTE.creamWhite).setStrokeStyle(STROKE_WIDTH, darken(PALETTE.creamWhite, 0.4));
      this.add
        .text(x - CARD_W / 2 + 14, y - CARD_H / 2 + 12, doc.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '17px',
          fontStyle: 'bold',
          color: `#${PALETTE.outline.toString(16)}`,
        })
        .setOrigin(0, 0);
      // 星标（用户关也记录闯关进度——反馈补齐：列表未展示星级）
      const stars = this.progress.get(doc.id)?.stars ?? 0;
      this.add
        .text(x - CARD_W / 2 + 14, y - 10, `★`.repeat(stars) + `☆`.repeat(3 - stars), {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          color: stars > 0 ? `#${PALETTE.accentOrange.toString(16)}` : `#${PALETTE.metalGray.toString(16)}`,
        })
        .setOrigin(0, 0.5);
      this.add
        .text(x + CARD_W / 2 - 14, y - 10, `${doc.fixed.length} 个道具 · ${doc.meta?.verified ? '已验证 ✓' : '未验证'}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: `#${PALETTE.darkGray.toString(16)}`,
        })
        .setOrigin(1, 0.5);

      // 三等宽按钮行（反馈修复：原游玩/导出/删除挤在中间——导出独立成钮等宽排布）
      const btnY = y + 30;
      const actions: Array<{ label: string; color: number; cb: () => void }> = [
        {
          label: '▶ 游玩',
          color: PALETTE.grassGreen,
          cb: () => {
            // 用户关卡不经官方索引：文档挂 registry，LevelScene 兜底读取
            this.registry.set(`userDoc:${doc.id}`, doc);
            this.scene.start(SCENE_KEYS.LEVEL, { levelId: doc.id });
          },
        },
        {
          label: '📤 导出',
          color: PALETTE.accentOrange,
          cb: () => downloadText(`${doc.id}.clab`, encodeClab(doc)),
        },
        {
          label: '🗑 删除',
          color: PALETTE.cherryRed,
          cb: () => this.confirmDelete(doc.id),
        },
      ];
      actions.forEach((a, ai) => {
        const ax = x + (ai - 1) * 112;
        this.add
          .rectangle(ax, btnY, 104, 36, a.color)
          .setStrokeStyle(2, darken(a.color, 0.4))
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', a.cb);
        this.add.text(ax, btnY, a.label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#FFF' }).setOrigin(0.5);
      });
    });
  }

  /** 删除确认弹层（大按钮，儿童友好） */
  private confirmDelete(id: string): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const overlay = this.add.container(0, 0).setDepth(100);
    overlay.add(this.add.rectangle(cx, cy, 1280, 720, 0x000000, 0.45));
    overlay.add(this.add.rectangle(cx, cy, 460, 200, PALETTE.creamWhite).setStrokeStyle(3, darken(PALETTE.cherryRed, 0.2)));
    overlay.add(
      this.add
        .text(cx, cy - 50, '确定要删除这个关卡吗？', { fontFamily: FONT_FAMILY, fontSize: '20px', color: `#${PALETTE.outline.toString(16)}` })
        .setOrigin(0.5),
    );
    const yes = this.add.rectangle(cx - 90, cy + 50, 120, 48, PALETTE.cherryRed).setInteractive({ useHandCursor: true });
    const no = this.add.rectangle(cx + 90, cy + 50, 120, 48, PALETTE.metalGray).setInteractive({ useHandCursor: true });
    overlay.add([yes, no]);
    overlay.add(this.add.text(cx - 90, cy + 50, '删除', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#FFF' }).setOrigin(0.5));
    overlay.add(this.add.text(cx + 90, cy + 50, '再想想', { fontFamily: FONT_FAMILY, fontSize: '17px', color: '#FFF' }).setOrigin(0.5));
    yes.on('pointerdown', () => {
      void this.repo.deleteUserLevel(id).then(() => this.scene.restart());
    });
    no.on('pointerdown', () => overlay.destroy(true));
  }


  /** 导入 .clab 关卡文件 */
  private async importClab(): Promise<void> {
    const raw = await pickTextFile('.clab,application/json');
    if (!raw) return;
    try {
      const doc = parseClab(raw);
      // 重新分配 ID 防覆盖（导入的关 всегда 成为新关）
      const fresh: LevelDoc = { ...doc, id: `u-${Date.now().toString(36)}`, source: 'user' };
      await this.repo.saveUserLevel(fresh);
      this.scene.restart();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.add
        .text(this.scale.width / 2, 560, `❌ 导入失败：${msg}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: `#${PALETTE.cherryRed.toString(16)}`,
        })
        .setOrigin(0.5)
        .setDepth(200);
      this.time.delayedCall(3000, () => this.scene.restart());
    }
  }

  /** 整库备份（.db 下载） */
  private async backupDb(): Promise<void> {
    const service = this.registry.get('db') as DbService;
    const bytes = await service.exportBytes();
    downloadBytes(`contraption-lab-backup-${new Date().toISOString().slice(0, 10)}.db`, bytes);
  }

  /** 恢复 .db 备份：整库回灌 → 立即快照到 IndexedDB → 刷新重载 */
  private async restoreDb(): Promise<void> {
    const bytes = await pickBinaryFile('.db');
    if (!bytes) return;
    const service = this.registry.get('db') as DbService;
    await service.importBytes(bytes);
    // importBytes 只改 worker 内存库，必须立即落 IndexedDB 快照（否则刷新丢失）
    await idbSave(await service.exportBytes());
    window.location.reload();
  }
}
