/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: EditorScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 关卡编辑器（设计文档 §8，小创作者模式核心）
 *       布局：顶部工具栏 ｜ 左侧道具库（滚动）｜ 中部画布 ｜ 右侧面板（属性/关卡）
 *       能力：放置/拖动/旋转/删除道具、球变体切换、目标配置（选球/选筐点击拾取）、
 *             托盘数量配置、超时设置、🧪试运行（引擎实时验证 → verified）、💾保存入库。
 *       交互遵循 D16 移动兼容基线：纯 Pointer、按钮热区 ≥44px。
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
import { SimulationEngine } from '../engine/SimulationEngine';
import { LevelGoalChecker } from '../level/LevelGoalChecker';
import type { LevelDoc, LevelGoal } from '../level/types';
import type { GameRepository } from '../db/repository';
import { PLACEABLE, DEFAULT_INVENTORY, GOAL_TYPES } from '../editor/editorCatalog';

/** 画布可编辑区（左右面板之间的区域）——左右面板等宽 224，画布最大化 */
const CANVAS_RECT = { x: 224, y: 64, w: 832, h: 608 };
/** 道具库面板宽 */
const PALETTE_W = 224;
/** 右侧面板 x 起点（与左侧等宽 224） */
const PANEL_X = 1056;
/** 滚动行高 */
const ROW_H = 44;

/** 编辑器交互模式 */
type EditMode = 'idle' | 'placing' | 'pickingActor' | 'pickingTarget';

export class EditorScene extends Phaser.Scene {
  /** 数据仓库（registry 共享） */
  private repo!: GameRepository;

  // ---- 编辑数据（关卡内容） ----
  /** 场景道具（画布上全部） */
  private entries: PropEntry[] = [];
  /** 托盘配置 */
  private inventory: Array<{ type: string; count: number; variant?: string }> = [];
  /** 目标（单目标编辑；多目标后续版本） */
  private goal: { type: string; actor: string | null; target: string | null } = { type: 'ball_in_basket', actor: null, target: null };
  /** 超时秒数 */
  private timeoutSec = 60;
  /** 试运行验证标记（导出/分享门槛） */
  private verified = false;
  /** 自增 pid 序号 */
  private pidSeq = 0;

  // ---- 交互状态 ----
  private mode: EditMode = 'idle';
  /** 放置模式下的目录条目 */
  private placingItem: { type: string; variant?: string } | null = null;
  private placingGhost: Phaser.GameObjects.Image | null = null;
  /** 选中的道具 pid */
  private selectedPid: string | null = null;
  private selectedRing: Phaser.GameObjects.Rectangle | null = null;
  /** 拖动中的 pid（区别于放置） */
  private draggingPid: string | null = null;
  /** 长按旋转定时器（触屏无键盘，长按 600ms = 旋转选中道具） */
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  /** 长按起点（位移超 18px 判为拖动并取消长按） */
  private longPressOrigin = { x: 0, y: 0 };

  // ---- 渲染容器 ----
  /** pid → 精灵 */
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** 道具库行容器（滚动用） */
  private paletteLayer!: Phaser.GameObjects.Container;
  /** 道具库固定外层容器（遮罩挂它身上） */
  private paletteHolder: Phaser.GameObjects.Container | null = null;
  private paletteScrollY = 0;
  /** 右侧面板动态文本引用 */
  private panelTexts: Record<string, Phaser.GameObjects.Text> = {};
  /** 右侧面板滚动容器（属性+托盘全内容） */
  private panelLayer: Phaser.GameObjects.Container | null = null;
  /** 面板固定外层容器：遮罩挂它身上（场景坐标固定窗口），内层滚动不带动遮罩 */
  private panelHolder: Phaser.GameObjects.Container | null = null;
  private panelScrollY = 0;
  private panelContentH = 0;
  /** 顶部状态文本 */
  private statusText!: Phaser.GameObjects.Text;
  /** 道具库分组总高（滚动上限计算） */
  private paletteContentH = 0;

  // ---- 试运行 ----
  private sim: SimulationEngine | null = null;
  private checker: LevelGoalChecker | null = null;

  constructor() {
    super(SCENE_KEYS.EDITOR);
  }

  create(): void {
    this.repo = this.registry.get('repo') as GameRepository;
    this.inventory = DEFAULT_INVENTORY.map((i) => ({ ...i }));
    this.verified = false;

    this.renderTopBar();
    this.renderPaletteFrame();
    this.renderPanelFrame();
    this.renderCanvasZone();
    this.refreshPalette();
    this.refreshPanel();
    this.setStatus('从左侧道具库点击一个道具开始创作！');
  }

  // ================= 顶部工具栏 =================

  private renderTopBar(): void {
    this.add.rectangle(640, 28, 1280, 56, PALETTE.bgDesk).setStrokeStyle(2, darken(PALETTE.bgDesk, 0.3));
    this.add.text(16, 28, '🛠 关卡工坊', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` }).setOrigin(0, 0.5);
    this.statusText = this.add.text(180, 28, '', { fontFamily: FONT_FAMILY, fontSize: '14px', color: `#${PALETTE.darkGray.toString(16)}` }).setOrigin(0, 0.5);

    this.topButton(860, '↺ 清空', PALETTE.metalGray, () => this.clearAll());
    this.topButton(960, '🧪 试运行', PALETTE.techBlue, () => this.testRun());
    this.topButton(1060, '💾 保存', PALETTE.grassGreen, () => this.saveLevel());
    this.topButton(1160, '↩ 主页', PALETTE.cherryRed, () => this.scene.start(SCENE_KEYS.HOME));
  }

  private topButton(x: number, label: string, color: number, cb: () => void): void {
    this.add
      .rectangle(x, 28, 92, 40, color)
      .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => cb());
    this.add.text(x, 28, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#FFFFFF' }).setOrigin(0.5);
  }

  private setStatus(msg: string): void {
    this.statusText.setText(msg);
  }

  // ================= 左侧道具库 =================

  private renderPaletteFrame(): void {
    const frame = this.add.rectangle(PALETTE_W / 2, 384, PALETTE_W, 664, PALETTE.creamWhite).setStrokeStyle(2, darken(PALETTE.creamWhite, 0.35));
    frame.setDepth(-1);
    this.add.text(14, 74, '道具库', { fontFamily: FONT_FAMILY, fontSize: '17px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` });
    this.paletteLayer = this.add.container(0, 0);
    // 外层固定 holder 持遮罩（场景坐标窗口 y 88..692），滚动内容不带动遮罩
    this.paletteHolder = this.add.container(0, 0);
    const pg = this.make.graphics({ x: 0, y: 0 }, false);
    pg.fillStyle(0xffffff);
    pg.fillRect(0, 88, PALETTE_W, 604);
    this.paletteHolder.setMask(pg.createGeometryMask());
    this.paletteHolder.add(this.paletteLayer);
    // 滚动按钮（上下箭头，44px 热区）
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

  /** 重建道具库列表（分类分组） */
  /**
   * Bug3e 修复：道具库列表几何遮罩——滚动时不穿出面板覆盖其他 UI。
   * 可视区上下留出滚动按钮位置（y 90..646），右侧留按钮列（宽 PALETTE_W-44）。
   */


  private refreshPalette(): void {
    this.paletteLayer.removeAll(true);
    let y = 104;
    let lastCategory = '';
    for (const item of PLACEABLE) {
      // 分类标题
      if (item.category !== lastCategory) {
        lastCategory = item.category;
        this.paletteLayer.add(
          this.add.text(16, y, `— ${item.category}`, {
            fontFamily: FONT_FAMILY,
            fontSize: '13px',
            fontStyle: 'bold',
            color: `#${PALETTE.darkGray.toString(16)}`,
          }),
        );
        y += 22;
      }
      // 条目按钮
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
      row.add(
        this.add.text(58, 16, item.label, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: `#${PALETTE.outline.toString(16)}`,
        }).setOrigin(0, 0.5),
      );
      this.paletteLayer.add(row);
      y += ROW_H;
    }
    this.paletteContentH = y + 20;
    this.paletteLayer.setY(this.paletteScrollY);
  }

  private scrollPalette(delta: number): void {
    // 滚动范围：[0（顶）, min(0, 720-contentH)（底）]
    const minY = Math.min(0, 714 - this.paletteContentH);
    this.paletteScrollY = Phaser.Math.Clamp(this.paletteScrollY - delta, minY, 0);
    this.paletteLayer.y = this.paletteScrollY;
  }

  // ================= 右侧面板 =================

  private renderPanelFrame(): void {
    const frame = this.add.rectangle((PANEL_X + 1280) / 2, 384, 1280 - PANEL_X, 664, PALETTE.creamWhite).setStrokeStyle(2, darken(PALETTE.creamWhite, 0.35));
    frame.setDepth(-1);
    this.add.text(PANEL_X + 14, 74, '道具属性', { fontFamily: FONT_FAMILY, fontSize: '17px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` });
    // 滚动钮（右缘；面板内容超出可视高时上下滚动）
    this.add
      .rectangle(1263, 102, 34, 34, PALETTE.techBlue)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scrollPanel(-140));
    this.add.text(1263, 102, '▲', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5);
    this.add
      .rectangle(1263, 700, 34, 34, PALETTE.techBlue)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scrollPanel(140));
    this.add.text(1263, 700, '▼', { fontFamily: FONT_FAMILY, fontSize: '15px', color: '#FFF' }).setOrigin(0.5);
  }

  /** 面板滚动（内容高度由 refreshPanel 测得） */
  private scrollPanel(delta: number): void {
    const minY = Math.min(0, 646 - this.panelContentH);
    this.panelScrollY = Phaser.Math.Clamp(this.panelScrollY - delta, minY, 0);
    this.panelLayer?.setY(this.panelScrollY);
  }

  /** 刷新右侧面板（属性区 + 关卡设置区；全部动态元素装入滚动容器） */
  private refreshPanel(): void {
    // 清空旧动态对象（固定框架保留）
    for (const key of Object.keys(this.panelTexts)) {
      this.panelTexts[key].destroy();
    }
    this.panelTexts = {};
    if (this.panelLayer) {
      this.panelLayer.removeAll(true);
      this.panelLayer.destroy();
      this.panelLayer = null;
    }
    // 滚动容器：外层 holder 固定持有场景坐标遮罩（固定窗口），内层只做位移——
    // 否则 mask 随容器移动，滚动内容会盖住固定标题（实测踩坑）
    if (!this.panelHolder) {
      this.panelHolder = this.add.container(0, 0);
      const pmg = this.make.graphics({ x: 0, y: 0 }, false);
      pmg.fillStyle(0xffffff);
      pmg.fillRect(PANEL_X, 104, 1280 - PANEL_X, 586);
      this.panelHolder.setMask(pmg.createGeometryMask());
    }
    this.panelLayer = this.add.container(0, this.panelScrollY);
    this.panelHolder.add(this.panelLayer);
    const layer = this.panelLayer;
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(PANEL_X, 104, 1280 - PANEL_X, 594);
    layer.setMask(maskG.createGeometryMask());

    let y = 96;
    const px = PANEL_X + 14;
    // 步进按【实测文本高度】（wordWrap/多行文本高度不可预知，按单行算会与下方元素
    // 重叠——用户反馈「属性说明与可变输入框挤在一块」）
    const t = (key: string, text: string, size = 14, color: number = PALETTE.outline, bold = false): void => {
      const txt = this.add
        .text(px, y, text, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color: `#${color.toString(16)}`, fontStyle: bold ? 'bold' : 'normal', wordWrap: { width: 196 } })
        .setName('panelbtn_t_' + key);
      layer.add(txt);
      y += txt.height + 6;
    };
    const btn = (label: string, color: number, cb: () => void): void => {
      const b = this.add
        .rectangle(px + 98, y + 18, 120, 36, color)
        .setStrokeStyle(2, darken(color, 0.4))
        .setInteractive({ useHandCursor: true })
        .setName('panelbtn_b');
      b.on('pointerdown', () => cb());
      const txt = this.add.text(px + 98, y + 18, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#FFF' }).setOrigin(0.5, 0.5).setName('panelbtn_b');
      layer.add([b, txt]);
      y += 46;
    };

    // ---- 属性区 ----
    const sel = this.entries.find((e) => e.pid === this.selectedPid);
    if (!sel) {
      t('sel', '（未选中道具）\n点击画布上的道具进行编辑', 14, PALETTE.darkGray);
    } else {
      const label = PLACEABLE.find((p) => p.type === sel.type && p.variant === sel.variant)?.label ?? sel.type;
      t('sel', `已选中：${label}（${sel.pid}）`, 14, PALETTE.techBlue, true);
      t('pos', `角度 ${(sel.angle ?? 0)}° · ${sel.isStatic ? '固定' : '活动'}`, 13, PALETTE.darkGray);
      btn('↻ 旋转 +15°', PALETTE.techBlue, () => this.rotateSelected());
      btn(sel.isStatic ? '🔓 改为活动' : '🔒 改为固定', PALETTE.techBlue, () => this.toggleStaticSelected());
      // 球类：变体循环
      if (sel.type === 'ball') {
        btn('⚽ 换一种球', PALETTE.accentOrange, () => this.cycleBallVariant());
      }
      btn('🗑 删除道具', PALETTE.cherryRed, () => this.deleteSelected());
    }

    // ---- 关卡设置区 ----
    y += 8;
    this.panelTexts['div'] = this.add
      .text(px, y, '—— 关卡设置 ——', { fontFamily: FONT_FAMILY, fontSize: '15px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` })
      .setName('panelbtn_div');
    layer.add(this.panelTexts['div']);
    y += 24;

    const goalDef = GOAL_TYPES.find((g) => g.type === this.goal.type)!;
    t('goaltype', `目标：${goalDef.label}`, 14, PALETTE.grassGreen, true);
    btn('⇄ 换目标类型', PALETTE.grassGreen, () => {
      const idx = GOAL_TYPES.findIndex((g) => g.type === this.goal.type);
      const next = GOAL_TYPES[(idx + 1) % GOAL_TYPES.length];
      this.goal = { type: next.type, actor: null, target: null };
      this.refreshPanel();
    });
    // 目标参数拾取
    if (this.goal.type === 'ball_in_basket') {
      t('actor', this.goal.actor ? `主角球：${this.goal.actor}` : '主角球：未指定', 13);
      btn('① 点选球', PALETTE.techBlue, () => {
        this.mode = 'pickingActor';
        this.setStatus('点击画布中的一颗球，作为目标主角');
      });
      t('target', this.goal.target ? `篮筐：${this.goal.target}` : '篮筐：未指定', 13);
      btn('② 点选篮筐', PALETTE.techBlue, () => {
        this.mode = 'pickingTarget';
        this.setStatus('点击画布中的篮筐');
      });
    } else if (this.goal.type === 'balloon_popped') {
      t('target', this.goal.target ? `气球靶：${this.goal.target}` : '气球靶：未指定', 13);
      btn('① 点选气球靶', PALETTE.techBlue, () => {
        this.mode = 'pickingTarget';
        this.setStatus('点击画布中的气球靶');
      });
    } else {
      t('target', this.goal.target ? `铃铛：${this.goal.target}` : '铃铛：未指定', 13);
      btn('① 点选铃铛', PALETTE.techBlue, () => {
        this.mode = 'pickingTarget';
        this.setStatus('点击画布中的铃铛');
      });
    }

    t('timeout', `超时：${this.timeoutSec}s`, 13, PALETTE.darkGray);
    btn('+10s / -10s', PALETTE.metalGray, () => {
      this.timeoutSec = Phaser.Math.Clamp(this.timeoutSec + 10, 30, 120);
      this.refreshPanel();
    });

    // ---- 托盘配置（双列网格：省纵向空间，基本免滚）----
    y += 12;
    this.panelTexts['invtitle'] = this.add
      .text(px, y, '—— 玩家托盘 ——', { fontFamily: FONT_FAMILY, fontSize: '15px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` })
      .setName('panelbtn_it');
    layer.add(this.panelTexts['invtitle']);
    y += 36;
    for (const item of this.inventory) {
      const label = PLACEABLE.find((p) => p.type === item.type && p.variant === item.variant)?.label ?? item.type;
      // 一体化行框（反馈终版）：名称与「− 数量 ＋」全部收入同一个数据框内，
      // 长短名称（2/3/5 字）统一左对齐于框内，视觉整齐
      const b = this.add
        .rectangle(px + 102, y + 2, 204, 30, PALETTE.highlightWhite)
        .setStrokeStyle(2, darken(PALETTE.creamWhite, 0.3))
        .setName('panelbtn_inv');
      const tName = this.add
        .text(px + 8, y + 2, `${label}`, { fontFamily: FONT_FAMILY, fontSize: '13px', color: `#${PALETTE.outline.toString(16)}` })
        .setOrigin(0, 0.5)
        .setName('panelbtn_inv');
      const tMinus = this.add
        .text(px + 120, y + 2, '−', { fontFamily: FONT_FAMILY, fontSize: '20px', color: `#${PALETTE.cherryRed.toString(16)}` })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setName('panelbtn_inv')
        .on('pointerdown', () => {
          item.count = Math.max(0, item.count - 1);
          this.refreshPanel();
        });
      const tCount = this.add
        .text(px + 146, y + 2, `${item.count}`, { fontFamily: FONT_FAMILY, fontSize: '14px', color: `#${PALETTE.outline.toString(16)}` })
        .setOrigin(0.5)
        .setName('panelbtn_inv');
      const tPlus = this.add
        .text(px + 176, y + 2, '＋', { fontFamily: FONT_FAMILY, fontSize: '20px', color: `#${PALETTE.grassGreen.toString(16)}` })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setName('panelbtn_inv')
        .on('pointerdown', () => {
          item.count = Math.min(20, item.count + 1);
          this.refreshPanel();
        });
      layer.add([b, tName, tMinus, tCount, tPlus]);
      y += 38;
    }

    // 内容总高记录（滚动范围用）+ 应用当前滚动位
    this.panelContentH = y + 20;
    this.scrollPanel(0);
    // 属性区标题固定在遮罩外顶部（不随滚动）
    this.panelTexts['sel'] !== undefined && this.panelTexts['sel'].setY(100);
  }

  // ================= 画布交互区 =================

  /** 全屏画布交互 Zone：处理放置/选择/拖动/拾取 */
  private renderCanvasZone(): void {
    const zone = this.add
      .zone(CANVAS_RECT.x + CANVAS_RECT.w / 2, CANVAS_RECT.y + CANVAS_RECT.h / 2, CANVAS_RECT.w, CANVAS_RECT.h)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: false });
    // 画布底色网格提示
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(PALETTE.bgWall, 0.5);
    g.fillRect(CANVAS_RECT.x, CANVAS_RECT.y, CANVAS_RECT.w, CANVAS_RECT.h);
    g.lineStyle(1, darken(PALETTE.bgWall, 0.12), 0.5);
    for (let gx = CANVAS_RECT.x; gx <= CANVAS_RECT.x + CANVAS_RECT.w; gx += 40) {
      g.lineBetween(gx, CANVAS_RECT.y, gx, CANVAS_RECT.y + CANVAS_RECT.h);
    }
    for (let gy = CANVAS_RECT.y; gy <= CANVAS_RECT.y + CANVAS_RECT.h; gy += 40) {
      g.lineBetween(CANVAS_RECT.x, gy, CANVAS_RECT.x + CANVAS_RECT.w, gy);
    }

    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onCanvasDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.onPointerUp());
  }

  /** 画布按下：分派 放置/拾取/选中+拖动 */
  private onCanvasDown(pointer: Phaser.Input.Pointer): void {
    if (this.sim) return; // 试运行中锁定编辑
    const x = pointer.worldX;
    const y = pointer.worldY;
    if (x < CANVAS_RECT.x || x > CANVAS_RECT.x + CANVAS_RECT.w || y < CANVAS_RECT.y || y > CANVAS_RECT.y + CANVAS_RECT.h) {
      return; // 面板区域的点击不进画布逻辑
    }

    // 放置模式：落子
    if (this.mode === 'placing' && this.placingItem) {
      this.placeEntry(this.placingItem.type, x, y, this.placingItem.variant);
      return;
    }
    // 拾取模式：设定目标参数
    if (this.mode === 'pickingActor' || this.mode === 'pickingTarget') {
      const hit = this.hitEntry(x, y);
      if (hit) this.applyPicking(hit);
      return;
    }
    // 空闲：命中则选中并进入拖动；空白则取消选中
    const hit = this.hitEntry(x, y);
    if (hit) {
      this.selectPid(hit.pid);
      this.draggingPid = hit.pid;
      this.setStatus(`拖动移动 · 长按旋转 · 右侧面板调属性`);
      this.armLongPressRotate(hit.pid, x, y);
    } else {
      this.clearSelection();
    }
  }

  /** 武装长按旋转：600ms 内位移 <18px 则旋转该道具（触屏主交互） */
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
      this.verified = false;
      this.setStatus(`长按旋转：${pid} → ${entry.angle}°（可连续长按）`);
      // 连续长按支持：重新武装
      this.armLongPressRotate(pid, p.worldX, p.worldY);
    });
  }

  /** 取消长按计时（pointerup/开始拖动时调用） */
  private cancelLongPress(): void {
    this.longPressTimer?.remove(false);
    this.longPressTimer = null;
  }

  /** 指针移动：放置幽灵跟随 / 拖动道具 */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.mode === 'placing' && this.placingGhost) {
      this.placingGhost.setPosition(pointer.worldX, pointer.worldY);
    } else if (this.draggingPid) {
      const entry = this.entries.find((e) => e.pid === this.draggingPid);
      const img = this.sprites.get(this.draggingPid ?? '');
      if (entry && img) {
        entry.x = pointer.worldX;
        entry.y = pointer.worldY;
        img.setPosition(entry.x, entry.y);
        this.selectedRing?.setPosition(entry.x, entry.y);
      }
    }
  }

  private onPointerUp(): void {
    this.cancelLongPress();
    if (this.draggingPid) {
      this.draggingPid = null;
      this.setStatus('已落位。可继续拖动或用右侧面板调整属性');
      this.verified = false;
    }
  }

  /** 命中检测：距道具中心 38px 内取最近 */
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

  /** 拾取结果回填目标参数（带类型校验） */
  private applyPicking(hit: PropEntry): void {
    if (this.mode === 'pickingActor') {
      if (hit.type !== 'ball') {
        this.setStatus('主角必须是球！再点一颗球');
        return;
      }
      this.goal.actor = hit.pid;
    } else {
      const okMap: Record<string, string[]> = {
        ball_in_basket: ['basket', 'feedBowl'],
        balloon_popped: ['balloonTarget'],
        bell_rung: ['bell'],
      };
      if (!(okMap[this.goal.type] ?? []).includes(hit.type)) {
        this.setStatus('类型不匹配！请点选正确的目标物');
        return;
      }
      this.goal.target = hit.pid;
    }
    this.mode = 'idle';
    this.verified = false;
    this.refreshPanel();
    this.setStatus('目标参数已更新 ✓');
  }

  // ================= 道具操作 =================

  /** 从道具库进入放置模式 */
  private beginPlacing(item: { type: string; variant?: string }): void {
    if (this.sim) return;
    this.clearSelection();
    this.mode = 'placing';
    this.placingItem = item;
    this.placingGhost?.destroy();
    const probe: PropEntry = { pid: '_g', type: item.type, x: 0, y: 0, variant: item.variant };
    const view = PROP_REGISTRY[item.type].viewOf(probe);
    this.placingGhost = this.add.image(400, 300, view.texture).setAlpha(0.6);
    this.setStatus(`点击画布放置「${PLACEABLE.find((p) => p.type === item.type && p.variant === item.variant)?.label ?? item.type}」，可连续放置多个`);
  }

  /** 落位创建道具（pid 自增） */
  private placeEntry(type: string, x: number, y: number, variant?: string): void {
    const pid = `e${++this.pidSeq}`;
    const entry: PropEntry = { pid, type, x: Math.round(x), y: Math.round(y), angle: 0, variant };
    this.entries.push(entry);
    this.addSprite(entry);
    this.verified = false;
    this.setStatus(`已放置 ${pid}。点击它可选中，拖动可移动`);
  }

  private addSprite(entry: PropEntry): void {
    const view = PROP_REGISTRY[entry.type].viewOf(entry);
    const img = this.add
      .image(entry.x, entry.y, view.texture)
      .setRotation(Phaser.Math.DegToRad(entry.angle ?? 0))
      .setDepth(1);
    this.sprites.set(entry.pid, img);
  }

  private selectPid(pid: string): void {
    this.selectedPid = pid;
    this.selectedRing?.destroy();
    const img = this.sprites.get(pid);
    if (img) {
      this.selectedRing = this.add
        .rectangle(img.x, img.y, img.displayWidth + 14, img.displayHeight + 14)
        .setStrokeStyle(3, PALETTE.accentOrange, 0.9)
        .setDepth(2);
    }
    this.refreshPanel();
  }

  private clearSelection(): void {
    this.selectedPid = null;
    this.selectedRing?.destroy();
    this.selectedRing = null;
    this.refreshPanel();
  }

  private rotateSelected(): void {
    const e = this.entries.find((x) => x.pid === this.selectedPid);
    if (!e) return;
    e.angle = ((e.angle ?? 0) + 15) % 360;
    this.sprites.get(e.pid)?.setRotation(Phaser.Math.DegToRad(e.angle));
    this.selectedRing?.setRotation(Phaser.Math.DegToRad(e.angle));
    this.verified = false;
    this.refreshPanel();
  }

  private toggleStaticSelected(): void {
    const e = this.entries.find((x) => x.pid === this.selectedPid);
    if (!e) return;
    e.isStatic = !e.isStatic;
    this.verified = false;
    this.refreshPanel();
  }

  /** 球变体循环：wood→steel→bouncy→pingpong→bowling */
  private cycleBallVariant(): void {
    const e = this.entries.find((x) => x.pid === this.selectedPid);
    if (!e || e.type !== 'ball') return;
    const order = ['wood', 'steel', 'bouncy', 'pingpong', 'bowling'];
    e.variant = order[(order.indexOf(e.variant ?? 'wood') + 1) % order.length];
    // 换贴图
    const img = this.sprites.get(e.pid);
    if (img) {
      img.setTexture(PROP_REGISTRY.ball.viewOf(e).texture);
    }
    this.verified = false;
    this.refreshPanel();
  }

  private deleteSelected(): void {
    const pid = this.selectedPid;
    if (!pid) return;
    this.entries = this.entries.filter((e) => e.pid !== pid);
    this.sprites.get(pid)?.destroy();
    this.sprites.delete(pid);
    // 目标引用失效则清空
    if (this.goal.actor === pid) this.goal.actor = null;
    if (this.goal.target === pid) this.goal.target = null;
    this.clearSelection();
    this.verified = false;
  }

  private clearAll(): void {
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    this.entries = [];
    this.goal = { type: this.goal.type, actor: null, target: null };
    this.clearSelection();
    this.verified = false;
    this.pidSeq = 0;
    this.setStatus('画布已清空，重新开始吧！');
  }

  // ================= 关卡文档构建 / 试运行 / 保存 =================

  /** 构建关卡文档（试运行与保存共用） */
  private buildDoc(id: string, name: string): LevelDoc {
    const goalDef = GOAL_TYPES.find((g) => g.type === this.goal.type)!;
    const goals: LevelGoal[] = [];
    if (this.goal.type === 'ball_in_basket' && this.goal.actor && this.goal.target) {
      goals.push({ type: 'ball_in_basket', actor: this.goal.actor, target: this.goal.target, desc: '把球送进篮筐' });
    } else if (this.goal.type === 'balloon_popped' && this.goal.target) {
      goals.push({ type: 'balloon_popped', target: this.goal.target, desc: '戳爆气球靶' });
    } else if (this.goal.type === 'bell_rung' && this.goal.target) {
      goals.push({ type: 'bell_rung', target: this.goal.target, desc: '敲响铃铛' });
    }
    void goalDef;
    return {
      version: 2,
      id,
      source: 'user',
      name,
      chapter: 0,
      author: '小发明家',
      scene: { width: 1280, height: 720, bg: 'workshop' },
      fixed: this.entries.map((e) => ({ ...e })),
      inventory: this.inventory.filter((i) => i.count > 0).map((i) => ({ ...i })),
      goals,
      starRule: { maxParts: this.inventory.reduce((s, i) => s + Math.min(i.count, 6), 0) },
      hints: { text: '想一想：怎么让连锁反应发生？' },
      meta: { timeout: this.timeoutSec, verified: this.verified },
    };
  }

  /** 试运行：编辑器内直接起引擎验证（达成 → verified） */
  private testRun(): void {
    if (this.sim) {
      // 再点一次 = 停止复位
      this.sim.stop();
      this.sim = null;
      this.checker = null;
      this.rebuildSprites();
      this.setStatus('已停止试运行，继续编辑');
      return;
    }
    const doc = this.buildDoc('_test', '试运行');
    if (doc.goals.length === 0) {
      this.setStatus('目标还没配置完整（选好球和篮筐）！', );
      return;
    }
    this.clearSelection();
    this.sim = new SimulationEngine({ mode: 'level', timeoutMs: (doc.meta!.timeout! + 10) * 1000 });
    this.sim.loadProps(doc.fixed);
    this.checker = new LevelGoalChecker(doc, this.sim.events);
    this.sim.setGoalChecker(this.checker);
    this.sim.events.on('stateChanged', ({ to }) => {
      if (to === 'RUNNING') this.setStatus('试运行中……（再点 🧪 停止）');
      if (to === 'SUCCESS') {
        this.verified = true;
        this.setStatus('🎉 试运行达成目标！关卡已验证，可以保存');
      }
      if (to === 'FAILED') this.setStatus('未达成——调整一下道具位置再试');
    });
    this.sim.start();
  }

  /** 停止后重建编辑态精灵 */
  private rebuildSprites(): void {
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    for (const e of this.entries) this.addSprite(e);
  }

  /** 保存到我的关卡（SQLite） */
  private async saveLevel(): Promise<void> {
    const doc = this.buildDoc(`u-${Date.now().toString(36)}`, `我的关卡 ${new Date().getMonth() + 1}-${new Date().getDate()}`);
    if (doc.goals.length === 0) {
      this.setStatus('保存失败：请先配置完整的目标');
      return;
    }
    if (this.entries.length === 0) {
      this.setStatus('保存失败：画布上至少要有一个道具');
      return;
    }
    await this.repo.saveUserLevel(doc);
    this.setStatus(this.verified ? '💾 已保存（已验证 ✓）——到主页「我的关卡」里玩玩看！' : '💾 已保存（未验证：建议先 🧪 试运行通关再分享）');
  }

  /** 每帧：试运行物理步进与精灵同步 */
  override update(): void {
    if (!this.sim) return;
    this.sim.step();
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
}
