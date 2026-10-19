/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SandboxScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 沙盒模拟器（设计文档 §7.2，第 1 章通关解锁 D13）
 *       自由实验场：全道具无限量、无目标、FREE_RUN 直启（无倒计时）、
 *       0.25×/1×/2× 变速随时启停、保存/读取「我的机关」（sandbox_machines 表）。
 *       交互模式与编辑器一致（道具库滚动/画布拖放/浮动旋转删除），
 *       区别：无目标无托盘——想放多少放多少，主打「自由探索物理」。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { PROP_REGISTRY } from '../engine/propRegistry';
import type { PropEntry } from '../engine/PropBase';
import { SimulationEngine, SimSpeed } from '../engine/SimulationEngine';
import type { GameRepository } from '../db/repository';
import { PLACEABLE } from '../editor/editorCatalog';
import { FXLayer } from '../fx/Particles';
import { wireSimFX } from '../fx/wire';

/** 道具库面板宽 */
const PALETTE_W = 224;
/** 滚动行高 */
const ROW_H = 44;

export class SandboxScene extends Phaser.Scene {
  /** 数据仓库（保存/读取机关） */
  private repo!: GameRepository;

  // ---- 世界数据 ----
  private entries: PropEntry[] = [];
  private pidSeq = 0;

  // ---- 交互状态 ----
  private placingItem: { type: string; variant?: string } | null = null;
  private placingGhost: Phaser.GameObjects.Image | null = null;
  private floatButtons: Phaser.GameObjects.GameObject[] = [];
  private draggingPid: string | null = null;
  /** 长按旋转定时器（触屏：600ms 不动 = 旋转选中道具） */
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  private longPressOrigin = { x: 0, y: 0 };

  // ---- 渲染 ----
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private paletteLayer!: Phaser.GameObjects.Container;
  /** 道具库固定外层容器（遮罩挂它身上） */
  private paletteHolder: Phaser.GameObjects.Container | null = null;
  private paletteScrollY = 0;
  private paletteContentH = 0;
  private statusText!: Phaser.GameObjects.Text;
  private runBtnLabel!: Phaser.GameObjects.Text;

  // ---- 引擎 ----
  private sim: SimulationEngine | null = null;
  private speed: SimSpeed = 1;
  private fx!: FXLayer;

  constructor() {
    super(SCENE_KEYS.SANDBOX);
  }

  create(): void {
    this.repo = this.registry.get('repo') as GameRepository;
    this.fx = new FXLayer(this);
    this.speed = 1;

    this.renderTopBar();
    this.renderPalette();
    this.renderCanvasZone();
    this.refreshPalette();
    this.setStatus('欢迎来到沙盒实验室！随便放点什么，按 ▶ 看它跑起来 🧪');
  }

  // ================= 顶部工具栏 =================

  private renderTopBar(): void {
    this.add.rectangle(640, 28, 1280, 56, PALETTE.bgDesk).setStrokeStyle(2, darken(PALETTE.bgDesk, 0.3));
    this.add.text(16, 28, '🧪 沙盒实验室', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` }).setOrigin(0, 0.5);
    this.statusText = this.add.text(200, 28, '', { fontFamily: FONT_FAMILY, fontSize: '14px', color: `#${PALETTE.darkGray.toString(16)}` }).setOrigin(0, 0.5);

    this.topButton(660, '↩ 主页', PALETTE.cherryRed, () => this.scene.start(SCENE_KEYS.HOME));
    this.topButton(790, '▶ 启动', PALETTE.grassGreen, () => this.toggleRun());
    this.topSpeedLabel = this.topButton(920, '🐢 常速', PALETTE.techBlue, () => this.toggleSpeed());
    this.topButton(1050, '💾 存机关', PALETTE.metalGray, () => this.saveMachine());
    this.topButton(1180, '📂 取机关', PALETTE.accentOrange, () => this.openLoadOverlay());
  }

  private topSpeedLabel: Phaser.GameObjects.Text | null = null;

  /** 顶栏按钮（返回文字引用以便后续改标签） */
  private topButton(x: number, label: string, color: number, cb: () => void): Phaser.GameObjects.Text {
    this.add
      .rectangle(x, 28, 112, 40, color)
      .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => cb());
    const text = this.add.text(x, 28, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#FFF' }).setOrigin(0.5);
    if (label.includes('启动') || label.includes('停止')) this.runBtnLabel = text;
    return text;
  }

  private setStatus(msg: string): void {
    this.statusText.setText(msg);
  }

  // ================= 左侧道具库（与编辑器同款） =================

  private renderPalette(): void {
    const frame = this.add.rectangle(PALETTE_W / 2, 384, PALETTE_W, 664, PALETTE.creamWhite).setStrokeStyle(2, darken(PALETTE.creamWhite, 0.35));
    frame.setDepth(-1);
    this.add.text(14, 74, '道具库（无限量）', { fontFamily: FONT_FAMILY, fontSize: '15px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` });
    this.paletteLayer = this.add.container(0, 0);
    // 外层固定 holder 持遮罩（场景坐标窗口）
    this.paletteHolder = this.add.container(0, 0);
    const pg = this.make.graphics({ x: 0, y: 0 }, false);
    pg.fillStyle(0xffffff);
    pg.fillRect(0, 88, PALETTE_W, 604);
    this.paletteHolder.setMask(pg.createGeometryMask());
    this.paletteHolder.add(this.paletteLayer);
    this.add
      .rectangle(PALETTE_W - 26, 92, 36, 36, PALETTE.techBlue)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scrollPalette(-160));
    this.add.text(PALETTE_W - 26, 92, '▲', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#FFF' }).setOrigin(0.5);
    this.add
      .rectangle(PALETTE_W - 26, 700, 36, 36, PALETTE.techBlue)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scrollPalette(160));
    this.add.text(PALETTE_W - 26, 700, '▼', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#FFF' }).setOrigin(0.5);
  }

  /**
   * Bug3e 修复：道具库列表几何遮罩——滚动时不穿出面板覆盖其他 UI。
   * 可视区上下留出滚动按钮位置（y 90..646），右侧留按钮列（宽 PALETTE_W-44）。
   */

  private refreshPalette(): void {
    this.paletteLayer.removeAll(true);
    let y = 104;
    let lastCategory = '';
    for (const item of PLACEABLE) {
      if (item.category !== lastCategory) {
        lastCategory = item.category;
        this.paletteLayer.add(
          this.add.text(16, y, `— ${item.category}`, { fontFamily: FONT_FAMILY, fontSize: '13px', fontStyle: 'bold', color: `#${PALETTE.darkGray.toString(16)}` }),
        );
        y += 22;
      }
      const probe: PropEntry = { pid: '_p', type: item.type, x: 0, y: 0, variant: item.variant };
      const view = PROP_REGISTRY[item.type].viewOf(probe);
      const scale = Math.min(30 / view.width, 30 / view.height, 1);
      const row = this.add.container(0, y);
      const bg = this.add
        .rectangle(116, 16, 208, ROW_H - 6, PALETTE.highlightWhite)
        .setStrokeStyle(2, darken(PALETTE.creamWhite, 0.3))
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.beginPlacing(item));
      row.add(bg);
      row.add(this.add.image(34, 16, view.texture).setScale(scale));
      row.add(this.add.text(58, 16, item.label, { fontFamily: FONT_FAMILY, fontSize: '15px', color: `#${PALETTE.outline.toString(16)}` }).setOrigin(0, 0.5));
      this.paletteLayer.add(row);
      y += ROW_H;
    }
    this.paletteContentH = y + 20;
    this.paletteLayer.setY(this.paletteScrollY);
  }

  private scrollPalette(delta: number): void {
    const minY = Math.min(0, 692 - this.paletteContentH);
    this.paletteScrollY = Phaser.Math.Clamp(this.paletteScrollY - delta, minY, 0);
    this.paletteLayer.setY(this.paletteScrollY);
  }

  // ================= 画布 =================

  private renderCanvasZone(): void {
    // 画布区：道具库右侧全部区域（240..1280 × 64..720）
    const zone = this.add.zone(760, 392, 1040, 656).setOrigin(0.5).setInteractive({ useHandCursor: false });
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(PALETTE.bgWall, 0.5);
    g.fillRect(240, 64, 1040, 656);
    g.lineStyle(1, darken(PALETTE.bgWall, 0.12), 0.5);
    for (let gx = 240; gx <= 1280; gx += 40) g.lineBetween(gx, 64, gx, 720);
    for (let gy = 64; gy <= 720; gy += 40) g.lineBetween(240, gy, 1280, gy);

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onCanvasDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.onPointerUp());
  }

  private onCanvasDown(pointer: Phaser.Input.Pointer): void {
    if (this.sim) return; // 运行中锁定编辑
    const { x, y } = pointer;
    if (x < 240 || y < 64) return;
    if (this.modePlacing() && this.placingItem) {
      this.placeEntry(this.placingItem.type, x, y, this.placingItem.variant);
      return;
    }
    const hit = this.hitEntry(x, y);
    if (hit) {
      this.selectPid(hit.pid);
      this.draggingPid = hit.pid;
      this.armLongPressRotate(hit.pid, x, y);
    } else {
      this.clearSelection();
    }
  }

  /** 武装长按旋转：600ms 内位移 <18px 则旋转（触屏主交互） */
  private armLongPressRotate(pid: string, x: number, y: number): void {
    this.cancelLongPress();
    this.longPressOrigin = { x, y };
    this.longPressTimer = this.time.delayedCall(600, () => {
      this.longPressTimer = null;
      const p = this.input.activePointer;
      if (!p.isDown) return;
      if (Math.hypot(p.worldX - this.longPressOrigin.x, p.worldY - this.longPressOrigin.y) > 18) return;
      const entry = this.entries.find((e) => e.pid === pid);
      if (!entry) return;
      entry.angle = ((entry.angle ?? 0) + 15) % 360;
      this.sprites.get(pid)?.setRotation(Phaser.Math.DegToRad(entry.angle));
      this.armLongPressRotate(pid, p.worldX, p.worldY);
    });
  }

  private cancelLongPress(): void {
    this.longPressTimer?.remove(false);
    this.longPressTimer = null;
  }

  private modePlacing(): boolean {
    return this.placingItem !== null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.placingGhost) {
      this.placingGhost.setPosition(pointer.worldX, pointer.worldY);
    } else if (this.draggingPid) {
      const entry = this.entries.find((e) => e.pid === this.draggingPid);
      const img = this.sprites.get(this.draggingPid ?? '');
      if (entry && img) {
        entry.x = pointer.worldX;
        entry.y = pointer.worldY;
        img.setPosition(entry.x, entry.y);
      }
    }
  }

  private onPointerUp(): void {
    this.cancelLongPress();
    this.draggingPid = null;
  }

  private hitEntry(x: number, y: number): PropEntry | null {
    let best: PropEntry | null = null;
    let bestD = 38;
    for (const e of this.entries) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ================= 道具操作 =================

  private beginPlacing(item: { type: string; variant?: string }): void {
    if (this.sim) return;
    this.clearSelection();
    this.placingItem = item;
    this.placingGhost?.destroy();
    const probe: PropEntry = { pid: '_g', type: item.type, x: 0, y: 0, variant: item.variant };
    const view = PROP_REGISTRY[item.type].viewOf(probe);
    this.placingGhost = this.add.image(500, 300, view.texture).setAlpha(0.6);
    this.setStatus(`点击画布放置（可连续放），点空白处或再点道具库切换`);
  }

  private placeEntry(type: string, x: number, y: number, variant?: string): void {
    const pid = `s${++this.pidSeq}`;
    const entry: PropEntry = { pid, type, x: Math.round(x), y: Math.round(y), angle: 0, variant };
    this.entries.push(entry);
    this.addSprite(entry);
    // 沙盒即时反馈：选中刚放的（可马上旋转/删除）
    this.selectPid(pid);
  }

  private addSprite(entry: PropEntry): void {
    const view = PROP_REGISTRY[entry.type].viewOf(entry);
    const img = this.add
      .image(entry.x, entry.y, view.texture)
      .setRotation(Phaser.Math.DegToRad(entry.angle ?? 0))
      .setDepth(1);
    this.sprites.set(entry.pid, img);
  }

  /** 选中 + 浮动操作钮（↻ 旋转 / ✕ 删除） */
  private selectPid(pid: string): void {
    this.clearSelection();
    const entry = this.entries.find((e) => e.pid === pid);
    const img = this.sprites.get(pid);
    if (!entry || !img) return;
    // 高亮框
    this.floatButtons.push(
      this.add
        .rectangle(entry.x, entry.y, img.displayWidth + 14, img.displayHeight + 14)
        .setStrokeStyle(3, PALETTE.accentOrange, 0.9)
        .setDepth(2),
    );
    const by = entry.y - img.displayHeight / 2 - 30;
    // 旋转钮
    const rot = this.add.circle(entry.x - 26, by, 20, PALETTE.techBlue).setStrokeStyle(2, darken(PALETTE.techBlue, 0.4)).setInteractive({ useHandCursor: true }).setDepth(3);
    rot.on('pointerdown', () => {
      entry.angle = ((entry.angle ?? 0) + 15) % 360;
      this.sprites.get(entry.pid)?.setRotation(Phaser.Math.DegToRad(entry.angle));
    });
    const rotText = this.add.text(entry.x - 26, by, '↻', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#FFF' }).setOrigin(0.5).setDepth(4);
    // 删除钮
    const del = this.add.circle(entry.x + 26, by, 20, PALETTE.cherryRed).setStrokeStyle(2, darken(PALETTE.cherryRed, 0.4)).setInteractive({ useHandCursor: true }).setDepth(3);
    del.on('pointerdown', () => {
      this.entries = this.entries.filter((e) => e.pid !== pid);
      this.sprites.get(pid)?.destroy();
      this.sprites.delete(pid);
      this.clearSelection();
    });
    const delText = this.add.text(entry.x + 26, by, '✕', { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#FFF' }).setOrigin(0.5).setDepth(4);
    this.floatButtons.push(rot, rotText, del, delText);
  }

  private clearSelection(): void {
    for (const obj of this.floatButtons) obj.destroy();
    this.floatButtons = [];
  }

  // ================= 运行控制 =================

  /** 启动/停止切换（FREE_RUN：无倒计时直启） */
  private toggleRun(): void {
    if (this.sim) {
      this.sim.stop();
      this.sim = null;
      this.rebuildSprites();
      this.runBtnLabel.setText('▶ 启动');
      this.setStatus('已停止并复位。继续改装你的机关！');
      return;
    }
    if (this.entries.length === 0) {
      this.setStatus('先从左边放点道具吧！');
      return;
    }
    this.clearSelection();
    this.placingItem = null;
    this.placingGhost?.destroy();
    this.placingGhost = null;
    this.sim = new SimulationEngine({ mode: 'sandbox', timeoutMs: 600_000 });
    this.sim.loadProps(this.entries.map((e) => ({ ...e })));
    this.sim.setSpeed(this.speed);
    wireSimFX(this, this.sim, this.fx);
    this.sim.events.on('propOutOfBounds', (e) => {
      this.setStatus(`${e.pid} 飞出画面啦（沙盒不判失败，继续玩）`);
    });
    this.sim.start();
    this.runBtnLabel.setText('⏹ 停止');
    this.setStatus(this.speed === 0.25 ? '自由运行中（慢放 0.25×）' : '自由运行中！随便观察～');
  }

  /** 倍速循环 1 → 0.25 → 2 → 1 */
  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 0.25 : this.speed === 0.25 ? 2 : 1;
    this.sim?.setSpeed(this.speed);
    const label = this.speed === 0.25 ? '🐢 慢放' : this.speed === 2 ? '⏩ 加速' : '🐢 常速';
    this.topSpeedLabel?.setText(label);
    this.setStatus(`倍速 ${this.speed}×`);
  }

  /** 停止后重建编辑态精灵（精确复位） */
  private rebuildSprites(): void {
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    for (const e of this.entries) this.addSprite(e);
  }

  // ================= 机关存取 =================

  /** 保存当前机关到 sandbox_machines */
  private async saveMachine(): Promise<void> {
    if (this.entries.length === 0) {
      this.setStatus('空机关不用存啦——先放点道具');
      return;
    }
    const now = new Date();
    const name = `机关 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    await this.repo.saveMachine(`m-${Date.now().toString(36)}`, name, JSON.stringify(this.entries));
    this.setStatus(`💾 已保存「${name}」（${this.entries.length} 个道具）`);
  }

  /** 打开机关列表浮层（读取 / 删除） */
  private openLoadOverlay(): void {
    void this.repo.listMachines().then((machines) => {
      if (machines.length === 0) {
        this.setStatus('还没有保存过机关～先 💾 存一个');
        return;
      }
      const overlay = this.add.container(0, 0).setDepth(100);
      overlay.add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.45));
      overlay.add(this.add.rectangle(640, 360, 560, Math.min(520, 120 + machines.length * 66), PALETTE.creamWhite).setStrokeStyle(3, darken(PALETTE.accentOrange, 0.2)));
      overlay.add(this.add.text(640, 140, '📂 我的机关', { fontFamily: FONT_FAMILY, fontSize: '24px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` }).setOrigin(0.5));
      machines.slice(0, 5).forEach((m, i) => {
        const y = 200 + i * 66;
        overlay.add(
          this.add
            .rectangle(520, y, 260, 48, PALETTE.grassGreen)
            .setStrokeStyle(2, darken(PALETTE.grassGreen, 0.4))
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.loadMachine(m.id, m.data, overlay)),
        );
        overlay.add(this.add.text(520, y, `▶ ${m.name}`, { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#FFF' }).setOrigin(0.5));
        overlay.add(
          this.add
            .rectangle(780, y, 120, 48, PALETTE.cherryRed)
            .setStrokeStyle(2, darken(PALETTE.cherryRed, 0.4))
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              void this.repo.deleteMachine(m.id).then(() => {
                overlay.destroy(true);
                this.openLoadOverlay();
              });
            }),
        );
        overlay.add(this.add.text(780, y, '🗑 删除', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5));
      });
      // 关闭按钮
      overlay.add(
        this.add
          .rectangle(640, 200 + Math.min(5, machines.length) * 66 + 10, 140, 44, PALETTE.metalGray)
          .setStrokeStyle(2, darken(PALETTE.metalGray, 0.4))
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => overlay.destroy(true)),
      );
      overlay.add(this.add.text(640, 200 + Math.min(5, machines.length) * 66 + 10, '✕ 关闭', { fontFamily: FONT_FAMILY, fontSize: '16px', color: '#FFF' }).setOrigin(0.5));
    });
  }

  /** 恢复机关到画布 */
  private loadMachine(id: string, data: string, overlay: Phaser.GameObjects.Container): void {
    void id;
    this.sim?.stop();
    this.sim = null;
    this.clearSelection();
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    try {
      this.entries = JSON.parse(data) as PropEntry[];
    } catch {
      this.entries = [];
    }
    this.pidSeq = this.entries.length;
    for (const e of this.entries) this.addSprite(e);
    overlay.destroy(true);
    this.runBtnLabel.setText('▶ 启动');
    this.setStatus('机关已恢复！按 ▶ 跑起来');
  }

  /** 每帧：FREE_RUN 物理步进与精灵同步 */
  override update(): void {
    if (!this.sim) return;
    this.sim.step();
    if (this.sim.state === 'FREE_RUN') {
      for (const prop of this.sim.getProps()) {
        const img = this.sprites.get(prop.pid);
        if (img) {
          img.setPosition(prop.body.position.x, prop.body.position.y);
          img.setRotation(prop.body.angle);
        }
      }
    }
  }
}
