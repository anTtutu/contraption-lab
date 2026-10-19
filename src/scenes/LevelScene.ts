/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: LevelScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 正式关卡页（闯关模式核心场景，设计文档 §3/§6/§9.2）
 *       职责：
 *       - 编辑态：托盘拖放道具（20px 吸附 + 15° 旋转 + 删除）、禁放区拦截
 *       - 运行态：SimulationEngine 驱动 + LevelGoalChecker 目标判定
 *       - 结算：星级（§6.2 三条件）+ 进度记录 + 下一关
 *       - 三级提示（§6.3）：文字 → 幽灵 → 参考解演示
 *       交互约定（D16 移动兼容基线）：Pointer 事件、热区 ≥48px、无键盘依赖。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { SimulationEngine } from '../engine/SimulationEngine';
import { PROP_REGISTRY } from '../engine/propRegistry';
import type { PropEntry } from '../engine/PropBase';
import { LevelGoalChecker } from '../level/LevelGoalChecker';
import { computeStars } from '../level/starRating';
import { findLevel, chapterLevels } from '../level/levelIndex';
import type { LevelDoc } from '../level/types';
import type { ProgressStore } from '../level/ProgressStore';
import type { SimSpeed } from '../engine/SimulationEngine';
import { SoundKit } from '../fx/SoundKit';
import { FXLayer } from '../fx/Particles';
import { wireSimFX } from '../fx/wire';

/** 位置吸附半格（px，§9.2 半格吸附） */
const SNAP_GRID = 20;
/** 旋转步进（度） */
const ROTATE_STEP = 15;
/** 托盘卡片尺寸 */
const TRAY_CARD = 72;

/** 场景启动参数 */
export interface LevelSceneData {
  levelId: string;
}

export class LevelScene extends Phaser.Scene {
  /** 关卡文档 */
  private doc!: LevelDoc;
  /** 进度存储（registry 全局共享） */
  private progress!: ProgressStore;
  /** 模拟引擎（启动时构建） */
  private sim: SimulationEngine | null = null;
  /** 目标判定器（与引擎同生命周期） */
  private checker: LevelGoalChecker | null = null;

  /** 玩家已放置道具（编辑态数据源） */
  private placed: PropEntry[] = [];
  /** 托盘剩余数量（type → 剩余，-1 无限） */
  private trayLeft = new Map<string, number>();
  /** 初始托盘快照（重置回补基准） */
  private initialInventory: Array<{ type: string; count: number; variant?: string }> = [];
  /** 托盘剩余徽章文本 */
  private trayBadges = new Map<string, Phaser.GameObjects.Text>();

  /** 全部精灵：pid → 贴图（运行态每帧同步刚体位姿） */
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** 编辑态玩家道具的高亮框 */
  private selectedRing: Phaser.GameObjects.Rectangle | null = null;
  /** 当前选中道具 pid */
  private selectedPid: string | null = null;
  /** 拖拽中的幽灵道具（未落位） */
  private dragGhost: PropEntry | null = null;
  private dragImage: Phaser.GameObjects.Image | null = null;
  private dragType = '';
  private dragVariant: string | undefined;
  private dragMeta: Record<string, unknown> | undefined;
  /** 拖拽是否收到过移动事件（防误放 (0,0)——测试反馈 Bug3d） */
  private dragMoved = false;
  /** 编辑态选中微调：被拖动的玩家道具 pid（Bug3c） */
  private repositionPid: string | null = null;
  /** 选中道具的浮动控件（ring+旋转+删除，重置需全清——Bug3b） */
  private floatControls: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Arc> = [];

  /** 提示等级（0 未用 → 3 已看演示） */
  private hintLevel = 0;
  /** 提示气泡 */
  private hintBubble: Phaser.GameObjects.Text | null = null;
  /** 运行倍速 */
  private speed: SimSpeed = 1;
  /** HUD 文本 */
  private tipText!: Phaser.GameObjects.Text;
  /** 禁放区图形 */
  private zoneGfx: Phaser.GameObjects.Graphics | null = null;
  /** 粒子特效层 */
  private fx!: FXLayer;
  /** 倒计时大数字（3-2-1，与实验场一致的反馈） */
  private countdownText: Phaser.GameObjects.Text | null = null;
  /** 音效（全局单例） */
  private readonly sfx = SoundKit.get();
  /** 静音标记 */
  private muted = false;

  constructor() {
    super(SCENE_KEYS.LEVEL);
  }

  init(data: LevelSceneData): void {
    // 官方索引优先；用户关卡（我的关卡/编辑器产物）从 registry 兜底读取
    this.doc = (findLevel(data.levelId) ??
      (this.registry.get(`userDoc:${data.levelId}`) as LevelDoc | undefined)) as LevelDoc;
    // 初始托盘快照：重置时完整回补（修复「重置后道具丢失」——放置扣减、重置须归还）
    this.initialInventory = this.doc.inventory.map((i) => ({ ...i }));
    this.placed = [];
    this.trayLeft.clear();
    this.trayBadges.clear();
    this.sprites.clear();
    this.hintLevel = 0;
    this.speed = 1;
    this.sim = null;
    this.checker = null;
    this.hintBubble = null;
    this.selectedPid = null;
    this.selectedRing = null;
    this.dragGhost = null;
    this.dragImage = null;
    this.zoneGfx = null;
  }

  create(): void {
    // 进度存储由主页写入 registry（跨场景共享）
    this.progress = this.registry.get('progress') as ProgressStore;
    this.fx = new FXLayer(this);
    this.muted = this.sfx.muted;

    this.renderForbiddenZones();
    this.renderFixedProps();
    this.renderTray();
    this.renderHud();
    this.renderButtons();
    this.setupReposition();
    // 倒计时大数字：COUNTDOWN 态居中显示 3-2-1（反馈补齐：与实验场一致的启动反馈）
    this.countdownText = this.add
      .text(640, 320, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '110px',
        fontStyle: 'bold',
        color: `#${PALETTE.techBlue.toString(16)}`,
        stroke: `#${PALETTE.creamWhite.toString(16)}`,
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
    this.showTip('从下方托盘拖出道具；点已放置的道具可拖动微调！');
  }

  // ---- 静态渲染 ----

  /** 绘制禁放区（红色虚线框 + 角标感叹号） */
  private renderForbiddenZones(): void {
    if (!this.doc.forbiddenZones?.length) return;
    this.zoneGfx = this.add.graphics();
    for (const zone of this.doc.forbiddenZones) {
      this.zoneGfx.lineStyle(3, PALETTE.cherryRed, 0.6);
      this.zoneGfx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      // 虚线感：叠加背景色短划（简化实现）
      this.zoneGfx.fillStyle(PALETTE.bgWall, 0.12);
      this.zoneGfx.fillRect(zone.x, zone.y, zone.w, zone.h);
    }
  }

  /** 渲染场景固定道具 */
  private renderFixedProps(): void {
    for (const entry of this.doc.fixed) {
      this.addSpriteFor(entry);
    }
  }

  /** 按注册表视图元数据创建精灵 */
  private addSpriteFor(entry: PropEntry): void {
    const reg = PROP_REGISTRY[entry.type];
    if (!reg) return;
    const view = reg.viewOf(entry);
    const img = this.add
      .image(entry.x, entry.y, view.texture)
      .setRotation(Phaser.Math.DegToRad(entry.angle ?? 0));
    this.sprites.set(entry.pid, img);
  }

  /** 底部托盘：每種道具一张卡（贴图 + 剩余数徽章） */
  private renderTray(): void {
    const items = this.doc.inventory;
    const totalW = items.length * (TRAY_CARD + 16);
    let x = this.scale.width / 2 - totalW / 2 + TRAY_CARD / 2 + 8;
    const y = this.scale.height - TRAY_CARD / 2 - 10;
    for (const item of items) {
      this.trayLeft.set(item.type, item.count);
      // 卡片底
      const card = this.add
        .rectangle(x, y, TRAY_CARD, TRAY_CARD, PALETTE.creamWhite)
        .setStrokeStyle(2, darken(PALETTE.creamWhite, 0.4))
        .setInteractive({ useHandCursor: true });
      // 卡片贴图（按第一个变体展示）
      const probe: PropEntry = { pid: '_probe', type: item.type, x, y, variant: item.variant, meta: item.meta };
      const view = PROP_REGISTRY[item.type].viewOf(probe);
      const scale = Math.min(52 / view.width, 52 / view.height, 1);
      this.add
        .image(x, y, view.texture)
        .setScale(scale)
        .setInteractive({ useHandCursor: false })
        .disableInteractive();
      // 数量徽章
      const badge = this.add
        .text(x + TRAY_CARD / 2 - 8, y - TRAY_CARD / 2 + 8, `×${item.count}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          fontStyle: 'bold',
          color: `#${PALETTE.highlightWhite.toString(16)}`,
          backgroundColor: `#${PALETTE.darkGray.toString(16)}`,
          padding: { x: 4, y: 1 },
        })
        .setOrigin(1, 0.5);
      this.trayBadges.set(item.type, badge);
      card.on('pointerdown', () => this.beginDrag(item.type, item.variant, item.meta));
      x += TRAY_CARD + 16;
    }
  }

  /** 顶部 HUD：关卡名 / 目标描述 / 提示条 */
  private renderHud(): void {
    this.add
      .text(20, 12, `${this.doc.id} ${this.doc.name}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: `#${PALETTE.outline.toString(16)}`,
      })
      .setOrigin(0, 0);
    const goalDesc = this.doc.goals.map((g) => g.desc).join('；');
    this.add
      .text(20, 42, `🎯 ${goalDesc}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: `#${PALETTE.darkGray.toString(16)}`,
        wordWrap: { width: 700 },
      })
      .setOrigin(0, 0);
    this.tipText = this.add
      .text(this.scale.width / 2, 86, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: `#${PALETTE.darkGray.toString(16)}`,
        backgroundColor: `#${PALETTE.creamWhite.toString(16)}`,
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0);
  }

  /** 右下按钮组（热区 ≥48px） */
  private renderButtons(): void {
    const y = 120;
    this.makeButton(1180, y, 150, 48, '↩ 返回', PALETTE.metalGray, () => this.goBack());
    this.makeButton(1180, y + 58, 150, 48, '▶ 启动', PALETTE.grassGreen, () => this.startRun());
    this.makeButton(1180, y + 116, 150, 48, '⏹ 停止', PALETTE.cherryRed, () => this.stopRun());
    this.makeButton(1180, y + 174, 150, 48, '↺ 重置', PALETTE.techBlue, () => this.resetLevel());
    this.makeButton(1180, y + 232, 150, 48, '💡 提示', PALETTE.accentOrange, () => this.showNextHint());
    this.makeButton(1180, y + 290, 150, 48, '🐢 慢放', PALETTE.metalGray, () => this.toggleSpeed());
    this.muteBtn = this.makeButton(1180, y + 348, 150, 48, this.muted ? '🔇 静音中' : '🔊 音效', PALETTE.metalGray, () => this.toggleMute());
  }

  /** 静音按钮文字引用 */
  private muteBtn: Phaser.GameObjects.Text | null = null;

  /** 切换静音（音效即时生效 + 设置持久化到 SQLite） */
  private toggleMute(): void {
    this.muted = !this.muted;
    this.sfx.setMuted(this.muted);
    this.muteBtn?.setText(this.muted ? '🔇 静音中' : '🔊 音效');
    const repo = this.registry.get('repo') as import('../db/repository').GameRepository;
    void repo.setSetting('muted', this.muted ? '1' : '0');
  }

  /**
   * Bug3c 修复：已放置道具的选中与拖动微调。
   * 编辑态点击画布 → 命中玩家道具 → 选中并可拖动（含禁放区回弹）。
   */
  private setupReposition(): void {
    // 低深度全屏 zone：不挡上层按钮（hitTest 按深度取顶）
    const zone = this.add.zone(640, 360, 1280, 720).setOrigin(0.5).setDepth(-2);
    zone.setInteractive({ useHandCursor: false });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.sim && this.sim.state !== 'EDITING') return; // 运行中锁编辑
      // 命中玩家道具（仅 u*；固定装置不可动）
      let best: { pid: string; d: number } | null = null;
      for (const e of this.placed) {
        const d = Math.hypot(e.x - p.worldX, e.y - p.worldY);
        if (d < 44 && (!best || d < best.d)) best = { pid: e.pid, d };
      }
      if (best) {
        this.selectProp(best.pid);
        this.repositionPid = best.pid;
      } else {
        this.clearSelection();
      }
    });
    // 拖动更新（复用全局 pointermove 总线）
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.repositionPid) return;
      const entry = this.placed.find((e) => e.pid === this.repositionPid);
      const img = this.sprites.get(this.repositionPid ?? '');
      if (entry && img) {
        const snapped = this.snapPoint(p.worldX, p.worldY);
        entry.x = snapped.x;
        entry.y = snapped.y;
        img.setPosition(snapped.x, snapped.y);
        // 选中框与浮动钮跟随（布局固定：旋转钮 x-26 / 删除钮 x+26，均 y-h/2-34）
        this.selectedRing?.setPosition(snapped.x, snapped.y);
        const by = snapped.y - img.displayHeight / 2 - 34;
        this.floatControls[0]?.setPosition(snapped.x - 26, by);
        this.floatControls[1]?.setPosition(snapped.x - 26, by);
        this.floatControls[2]?.setPosition(snapped.x + 26, by);
        this.floatControls[3]?.setPosition(snapped.x + 26, by);
      }
    });
    this.input.on('pointerup', () => {
      if (!this.repositionPid) return;
      const pid = this.repositionPid;
      this.repositionPid = null;
      // 禁放区校验：拖入禁区则回弹提示（浪费防护）
      const entry = this.placed.find((e) => e.pid === pid);
      if (entry && this.inForbiddenZone(entry.x, entry.y)) {
        const zoneTip = this.doc.forbiddenZones?.find((z) => this.hitZone(entry!.x, entry!.y, z));
        this.showTip(zoneTip?.tip ?? '道具不能放进红色区域！', PALETTE.cherryRed);
        this.deleteSelected(); // 回弹太复杂：直接退还（数量+1）并移除
        return;
      }
      if (entry) this.showTip('已微调位置。▶ 启动 试试效果！');
    });
  }

  /** 通用按钮（按下反馈 + 回调，返回文字引用） */
  private makeButton(x: number, y: number, w: number, h: number, label: string, color: number, onDown: () => void): Phaser.GameObjects.Text {
    this.add
      .rectangle(x, y, w, h, color)
      .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => onDown());
    return this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: `#${PALETTE.highlightWhite.toString(16)}`,
      })
      .setOrigin(0.5);
  }

  private showTip(msg: string, color: number = PALETTE.darkGray): void {
    this.tipText.setText(msg).setColor(`#${color.toString(16)}`);
  }

  // ---- 托盘拖放（编辑态核心交互） ----

  /** 从托盘开始拖出新道具 */
  private beginDrag(type: string, variant: string | undefined, meta: Record<string, unknown> | undefined): void {
    if (this.sim && this.sim.state !== 'EDITING' && this.sim.state !== null) {
      // 运行中不允许放置
      return;
    }
    const left = this.trayLeft.get(type) ?? 0;
    if (left === 0) {
      this.showTip('这种道具用完啦，试试别的搭配！', PALETTE.cherryRed);
      return;
    }
    this.clearSelection();
    this.dragMoved = false;
    this.dragType = type;
    this.dragVariant = variant;
    this.dragMeta = meta;
    const probe: PropEntry = { pid: '_drag', type, x: 0, y: 0, variant, meta };
    const view = PROP_REGISTRY[type].viewOf(probe);
    this.dragImage = this.add.image(0, 0, view.texture).setAlpha(0.75);
    this.dragGhost = { pid: '_drag', type, x: 0, y: 0, variant, meta };
    // 指针移动跟随（注册一次性 move/up 监听，落位后移除）
    this.input.on('pointermove', this.onDragMove, this);
    this.input.once('pointerup', this.onDragDrop as unknown as (p: Phaser.Input.Pointer) => void, this);
  }

  /** 拖拽跟随 + 吸附预览 */
  private onDragMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragGhost || !this.dragImage) return;
    this.dragMoved = true;
    const { x, y } = this.snapPoint(pointer.worldX, pointer.worldY);
    this.dragGhost.x = x;
    this.dragGhost.y = y;
    this.dragImage.setPosition(x, y);
    // 禁放区提示：悬停于禁放区时变红
    const bad = this.inForbiddenZone(x, y);
    this.dragImage.setTint(bad ? PALETTE.cherryRed : 0xffffff);
  }

  /** 松手落位（禁放区/出界/未移动拒绝，其余创建玩家道具） */
  private onDragDrop(): void {
    this.input.off('pointermove', this.onDragMove, this);
    const ghost = this.dragGhost;
    this.dragGhost = null;
    this.dragImage?.destroy();
    this.dragImage = null;
    if (!ghost) return;
    // Bug3d 防呆：指针从未移动（ghost 停在初始 0,0）或落点在 HUD 顶部区 → 不消耗道具
    if (!this.dragMoved || ghost.y < 110) {
      this.showTip('把道具拖到画布里再放手哦！');
      return;
    }

    if (this.inForbiddenZone(ghost.x, ghost.y)) {
      const zone = this.doc.forbiddenZones?.find((z) => this.hitZone(ghost.x, ghost.y, z));
      this.showTip(zone?.tip ?? '这里不能放道具哦！', PALETTE.cherryRed);
      return;
    }
    // 数量扣减
    const left = this.trayLeft.get(this.dragType) ?? 0;
    if (left > 0) this.trayLeft.set(this.dragType, left - 1);
    this.trayBadges.get(this.dragType)?.setText(`×${this.trayLeft.get(this.dragType)}`);

    // 创建玩家道具（pid: u1/u2/...）
    const pid = `u${this.placed.length + 1}`;
    const entry: PropEntry = {
      pid,
      type: this.dragType,
      x: ghost.x,
      y: ghost.y,
      angle: 0,
      variant: this.dragVariant,
      meta: this.dragMeta,
    };
    this.placed.push(entry);
    this.addSpriteFor(entry);
    this.selectProp(pid);
    this.showTip('点选道具可旋转（每次 15°）；拖到红色区域会被拒绝。');
  }

  /** 半格吸附 */
  private snapPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.round(x / SNAP_GRID) * SNAP_GRID,
      y: Math.round(y / SNAP_GRID) * SNAP_GRID,
    };
  }

  private hitZone(x: number, y: number, zone: { x: number; y: number; w: number; h: number }): boolean {
    return x > zone.x && x < zone.x + zone.w && y > zone.y && y < zone.y + zone.h;
  }

  private inForbiddenZone(x: number, y: number): boolean {
    return (this.doc.forbiddenZones ?? []).some((z) => this.hitZone(x, y, z));
  }

  // ---- 选中道具：旋转 / 删除 ----

  private clearSelection(): void {
    this.selectedPid = null;
    this.selectedRing?.destroy();
    this.selectedRing = null;
    // Bug3b：浮动控件（旋转/删除按钮）全部销毁，防重置残留
    for (const obj of this.floatControls) obj.destroy();
    this.floatControls = [];
    this.repositionPid = null;
  }

  /** 点选玩家道具（点击画布命中检测，半径 40px 内最近者） */
  private selectProp(pid: string): void {
    this.clearSelection();
    this.selectedPid = pid;
    const entry = this.placed.find((p) => p.pid === pid);
    const sprite = this.sprites.get(pid);
    if (!entry || !sprite) return;
    this.selectedRing = this.add
      .rectangle(entry.x, entry.y, sprite.displayWidth + 16, sprite.displayHeight + 16)
      .setStrokeStyle(3, PALETTE.accentOrange, 0.9);
    // 旋转 / 删除 浮动按钮（热区 44px；全部登记 floatControls 便于整体清理——Bug3b）
    const bx = entry.x;
    const by = entry.y - sprite.displayHeight / 2 - 34;
    const rot = this.add
      .circle(bx - 26, by, 22, PALETTE.techBlue)
      .setStrokeStyle(2, darken(PALETTE.techBlue, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.rotateSelected());
    const rotText = this.add.text(bx - 26, by, '↻', { fontFamily: FONT_FAMILY, fontSize: '22px', color: '#FFFFFF' }).setOrigin(0.5);
    const del = this.add
      .circle(bx + 26, by, 22, PALETTE.cherryRed)
      .setStrokeStyle(2, darken(PALETTE.cherryRed, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.deleteSelected());
    const delText = this.add.text(bx + 26, by, '✕', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#FFFFFF' }).setOrigin(0.5);
    this.floatControls = [rot, rotText, del, delText];
    this.showTip('拖动微调位置 · ↻ 旋转 · ✕ 删除（Bug 反馈修复：可移动已放置道具）');
  }

  /** 选中道具旋转 15° */
  private rotateSelected(): void {
    const entry = this.placed.find((p) => p.pid === this.selectedPid);
    if (!entry) return;
    entry.angle = ((entry.angle ?? 0) + ROTATE_STEP) % 360;
    this.sprites.get(entry.pid)?.setRotation(Phaser.Math.DegToRad(entry.angle));
    this.selectedRing?.setRotation(Phaser.Math.DegToRad(entry.angle));
  }

  /** 删除选中道具（归还托盘） */
  private deleteSelected(): void {
    const entry = this.placed.find((p) => p.pid === this.selectedPid);
    if (!entry) return;
    this.placed = this.placed.filter((p) => p.pid !== entry.pid);
    this.sprites.get(entry.pid)?.destroy();
    this.sprites.delete(entry.pid);
    // 归还数量
    const inv = this.doc.inventory.find((i) => i.type === entry.type);
    if (inv) {
      const left = this.trayLeft.get(entry.type) ?? 0;
      this.trayLeft.set(entry.type, Math.min(inv.count, left + 1));
      this.trayBadges.get(entry.type)?.setText(`×${this.trayLeft.get(entry.type)}`);
    }
    this.clearSelection();
  }

  // ---- 运行与结算 ----

  /** 启动：世界重建（固定 + 玩家道具）→ 倒计时 → 运行 */
  private startRun(): void {
    if (this.placed.length === 0) {
      this.showTip('先从托盘拖几个道具进场景吧！', PALETTE.cherryRed);
      return;
    }
    this.clearSelection();
    // 重建引擎与判定器（每轮干净世界）
    this.sim = new SimulationEngine({
      mode: 'level',
      timeoutMs: ((this.doc.meta?.timeout ?? 60) + 10) * 1000,
    });
    this.sim.loadProps([...this.doc.fixed, ...this.placed]);
    this.checker = new LevelGoalChecker(this.doc, this.sim.events);
    this.sim.setGoalChecker(this.checker);
    this.sim.setSpeed(this.speed);
    wireSimFX(this, this.sim, this.fx);
    this.sim.events.on('stateChanged', ({ to }) => {
      if (to === 'RUNNING') this.showTip('运行中……观察你的机关！', PALETTE.grassGreen);
      if (to === 'SUCCESS') this.onSuccess();
      if (to === 'FAILED') {
        this.sfx.fail();
        this.showTip('差一点点！按 ⏹ 停止回去调整一下～', PALETTE.cherryRed);
      }
    });
    this.sim.events.on('propOutOfBounds', (e) => {
      this.showTip(`小球「${e.pid}」飞出画面啦！`, PALETTE.cherryRed);
    });
    this.sim.start();
  }

  /** 停止：回编辑态（玩家道具保留） */
  private stopRun(): void {
    this.sim?.stop();
    this.rebuildEditSprites();
    this.showTip('已停止，继续调整你的机关吧！');
  }

  /** 重置：回到刚进关卡的完整状态（画布清空 + 托盘全额回补 + 提示清零） */
  private resetLevel(): void {
    this.sim?.stop();
    this.sim = null;
    this.placed = [];
    for (const [pid, img] of this.sprites) {
      if (pid.startsWith('u')) img.destroy();
    }
    // 清理固定道具外的精灵引用
    for (const pid of [...this.sprites.keys()]) {
      if (pid.startsWith('u')) this.sprites.delete(pid);
    }
    this.hintLevel = 0;
    this.hintBubble?.destroy();
    this.hintBubble = null;
    this.clearSelection();
    this.refreshGhostSprites();
    // 托盘全额回补（按初始快照重建剩余数量并刷新徽章——此前只清画布不还数量，
    // 表现为「重置后部分道具丢失」：放置扣减、重置须归还）
    this.trayLeft.clear();
    for (const item of this.initialInventory) {
      this.trayLeft.set(item.type, item.count);
      this.trayBadges.get(item.type)?.setText(`×${item.count}`);
    }
    this.showTip('已重置：道具已全部回到托盘。重新开始你的设计吧！');
  }

  /** 编辑态精灵重建：清空全部 → 重画固定 + 玩家 */
  private rebuildEditSprites(): void {
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    for (const entry of this.doc.fixed) this.addSpriteFor(entry);
    for (const entry of this.placed) this.addSpriteFor(entry);
    this.refreshGhostSprites();
  }

  /** 启动后的每帧同步 */
  override update(): void {
    if (!this.sim) return;
    this.sim.step();
    // 倒计时大数字：COUNTDOWN 显示剩余秒，其余隐藏
    if (this.countdownText) {
      const counting = this.sim.state === 'COUNTDOWN';
      this.countdownText
        .setVisible(counting)
        .setText(counting ? String(Math.max(1, Math.ceil(this.sim.countdownRemainingMs / 1000))) : '');
    }
    if (this.sim.state === 'RUNNING' || this.sim.state === 'COUNTDOWN') {
      for (const prop of this.sim.getProps()) {
        const img = this.sprites.get(prop.pid);
        if (img) {
          img.setPosition(prop.body.position.x, prop.body.position.y);
          img.setRotation(prop.body.angle);
        }
      }
    }
  }

  /** 达成目标：结算面板 */
  private onSuccess(): void {
    this.sfx.success();
    this.fx.confettiRain();
    const stars = computeStars(true, this.placed.length, this.doc.starRule.maxParts, this.hintLevel > 0);
    this.progress.recordClear(this.doc.id, stars, this.placed.length, this.hintLevel > 0);
    this.showResultPanel(stars);
  }

  /** 结算面板（星级 + 下一关/重玩/返回） */
  private showResultPanel(stars: number): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const panel = this.add.container(cx, cy);
    panel.add(this.add.rectangle(0, 0, 560, 340, PALETTE.creamWhite).setStrokeStyle(STROKE_WIDTH, darken(PALETTE.accentOrange, 0.2)));
    panel.add(
      this.add
        .text(0, -110, '🎉 机关成功！', { fontFamily: FONT_FAMILY, fontSize: '36px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` })
        .setOrigin(0.5),
    );
    // 星级（亮/暗三颗）
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 80;
      const lit = i < stars;
      panel.add(
        this.add
          .text(sx, -30, lit ? '★' : '☆', {
            fontFamily: FONT_FAMILY,
            fontSize: '56px',
            color: lit ? `#${PALETTE.accentOrange.toString(16)}` : `#${PALETTE.metalGray.toString(16)}`,
          })
          .setOrigin(0.5),
      );
    }
    const partsTip = this.placed.length <= this.doc.starRule.maxParts ? '道具效率达标！' : '再用少一点道具可以拿 ★2 哦';
    panel.add(
      this.add
        .text(0, 30, partsTip, { fontFamily: FONT_FAMILY, fontSize: '16px', color: `#${PALETTE.darkGray.toString(16)}` })
        .setOrigin(0.5),
    );
    // 三个操作按钮
    const btn = (bx: number, label: string, color: number, cb: () => void): void => {
      const rect = this.add
        .rectangle(bx, 100, 140, 52, color)
        .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4))
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', cb);
      const text = this.add
        .text(bx, 100, label, { fontFamily: FONT_FAMILY, fontSize: '19px', fontStyle: 'bold', color: `#${PALETTE.highlightWhite.toString(16)}` })
        .setOrigin(0.5);
      panel.add([rect, text]);
    };
    const nextLevel = this.nextLevelId();
    btn(-160, '↺ 再玩一次', PALETTE.techBlue, () => {
      this.scene.restart({ levelId: this.doc.id });
    });
    btn(0, nextLevel ? '▶ 下一关' : '↩ 返回列表', PALETTE.grassGreen, () => {
      if (nextLevel) this.scene.restart({ levelId: nextLevel });
      else this.goBack();
    });
    btn(160, this.isUserLevel ? '↩ 我的关卡' : '↩ 回章节', PALETTE.metalGray, () => this.goBack());
  }

  /** 是否用户自定义关卡（来源分流：返回去我的关卡而非章节页——反馈修复） */
  private get isUserLevel(): boolean {
    return this.doc.source === 'user';
  }

  /** 统一返回入口：官方关→章节页；用户关→我的关卡（chapter=0 会导致章节页取 CHAPTERS[-1] 崩溃） */
  private goBack(): void {
    if (this.isUserLevel) this.scene.start(SCENE_KEYS.MY_LEVELS);
    else this.scene.start(SCENE_KEYS.CHAPTER, { chapter: this.doc.chapter });
  }

  /** 下一关 ID（本章末尾则返回 null） */
  private nextLevelId(): string | null {
    const list = chapterLevels(this.doc.chapter);
    const idx = list.findIndex((l) => l.id === this.doc.id);
    return idx >= 0 && idx < list.length - 1 ? list[idx + 1].id : null;
  }

  // ---- 三级提示 ----

  /** 逐级展示提示（§6.3：文字 → 幽灵 → 演示） */
  private showNextHint(): void {
    this.hintLevel = Math.min(3, this.hintLevel + 1);
    switch (this.hintLevel) {
      case 1:
        this.hintBubble?.destroy();
        this.hintBubble = this.add
          .text(this.scale.width / 2, 130, `💡 ${this.doc.hints.text}`, {
            fontFamily: FONT_FAMILY,
            fontSize: '17px',
            color: `#${PALETTE.outline.toString(16)}`,
            backgroundColor: `#${PALETTE.accentOrange.toString(16)}`,
            padding: { x: 14, y: 8 },
            wordWrap: { width: 640 },
            align: 'center',
          })
          .setOrigin(0.5, 0);
        this.showTip('已使用提示（★3 需不用提示通关，可重置后再来）');
        break;
      case 2: {
        // 幽灵答案：关键摆放半透明展示
        this.hintBubble?.setText('💡 照着虚影摆摆看！（★3 已失效）');
        for (const g of this.doc.hints.ghost ?? []) {
          const view = PROP_REGISTRY[g.type].viewOf(g);
          this.add
            .image(g.x, g.y, view.texture)
            .setRotation(Phaser.Math.DegToRad(g.angle ?? 0))
            .setAlpha(0.4)
            .setName(`ghost_${g.pid}`);
        }
        break;
      }
      case 3: {
        // 参考解演示：清空玩家道具 → 摆上参考解 → 自动启动
        this.hintBubble?.setText('💡 看好了，咕咕博士的参考解！（★3 已失效）');
        for (const img of this.sprites.values()) img.destroy();
        this.sprites.clear();
        this.placed = (this.doc.hints.solution ?? []).map((s, i) => ({ ...s, pid: `u${i + 1}` }));
        for (const entry of this.doc.fixed) this.addSpriteFor(entry);
        for (const entry of this.placed) this.addSpriteFor(entry);
        this.time.delayedCall(600, () => this.startRun());
        break;
      }
    }
  }

  /** 幽灵精灵清理（重建编辑态时移除虚影） */
  private refreshGhostSprites(): void {
    for (const obj of this.children.getByName('ghost_') ? [this.children.getByName('ghost_')] : []) {
      obj?.destroy();
    }
    // getByName 只返回单个，逐个遍历移除全部幽灵
    for (const child of [...this.children.list]) {
      if (child.name.startsWith('ghost_')) child.destroy();
    }
  }

  /** 慢放/常速切换 */
  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 0.25 : 1;
    this.sim?.setSpeed(this.speed);
    this.showTip(this.speed === 0.25 ? '慢放中（0.25×）：看清每一步连锁！' : '已恢复常速（1×）');
  }
}
