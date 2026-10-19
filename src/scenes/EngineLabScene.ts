/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: EngineLabScene.ts
 * -----------------------------------------------------------------------------
 * 用途: 物理内核实验场（开发步骤 2 验收场景，后续演进为正式关卡页的骨架）
 *       验收标准（设计文档 §14 步骤 2）：木球在编辑/运行两态往返 + 物理确定性。
 *       演示剧本：斜坡上的木球 → 启动 → 倒计时 3-2-1 → 滚下斜坡 → 落上地面板
 *       → 滚出边界 → propOutOfBounds → FAILED（红字提示，不惩罚）→ ⏹ 停止
 *       → 全部道具精确复位回编辑摆放位。
 *       同屏可切 0.25×/1×/2× 三档倍速，直观验证 §7.1 变速设计。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE, FONT_FAMILY, STROKE_WIDTH } from '../core/palette';
import { darken } from '../core/color';
import { SCENE_KEYS } from '../core/keys';
import { SimulationEngine, SimSpeed } from '../engine/SimulationEngine';
import { PROP_REGISTRY } from '../engine/propRegistry';
import { LevelGoalChecker } from '../level/LevelGoalChecker';
import { FXLayer } from '../fx/Particles';
import { wireSimFX } from '../fx/wire';
import type { LevelDoc } from '../level/types';
import type { PropEntry } from '../engine/PropBase';

/**
 * 演示剧本 A「成功」（Bug2 反馈：成功与失败都要有）：
 * 复刻官方关 L1-01 的已验证几何——球滚下双斜坡进篮筐 → SUCCESS。
 */
const DEMO_SUCCESS: PropEntry[] = [
  // ⚠️ 顺序敏感：Matter 确定性依赖刚体装载序（与 L1-01 回归序一致：球→筐→板）
  { pid: 'ball1', type: 'ball', x: 250, y: 80, variant: 'steel' },
  { pid: 'shelf1', type: 'basket', x: 940, y: 560, isStatic: true },
  { pid: 'plank1', type: 'plank', x: 350, y: 200, angle: 15, isStatic: true },
  { pid: 'plank2', type: 'plank', x: 569, y: 258, angle: 15, isStatic: true },
];

/**
 * 演示剧本 B「失败」：悬空斜坡 + 木球 → 滚出斜坡坠出画布 → FAILED。
 */
const DEMO_FAIL: PropEntry[] = [
  { pid: 'plank1', type: 'plank', x: 520, y: 380, angle: 15, isStatic: true },
  { pid: 'ball1', type: 'ball', x: 410, y: 240, variant: 'wood' },
];

/** 倍速档位与按钮配置（顺序即展示顺序） */
const SPEED_OPTIONS: Array<{ speed: SimSpeed; label: string }> = [
  { speed: 0.25, label: '🐢0.25×' },
  { speed: 1, label: '1×' },
  { speed: 2, label: '⏩2×' },
];

export class EngineLabScene extends Phaser.Scene {
  /** 物理模拟内核（本场景的生命周期与引擎一一对应） */
  private sim!: SimulationEngine;
  /** pid → 贴图精灵 的同步表（每帧从刚体位姿同步） */
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** 状态徽标文本 */
  private stateText!: Phaser.GameObjects.Text;
  /** 步数/虚拟时长/倍速信息文本 */
  private clockText!: Phaser.GameObjects.Text;
  /** 倒计时大数字 */
  private countdownText!: Phaser.GameObjects.Text;
  /** 底部提示/结果文案 */
  private tipText!: Phaser.GameObjects.Text;
  /** 倍速按钮集合（用于选中态高亮） */
  private speedRects: Array<{ speed: SimSpeed; rect: Phaser.GameObjects.Rectangle }> = [];
  /** 本轮失败原因文案（出界/超时事件写入，FAILED 展示用） */
  private failReason = '';
  /** 粒子特效层 */
  private fx!: FXLayer;

  constructor() {
    super(SCENE_KEYS.ENGINE_LAB);
  }

  create(): void {
    this.fx = new FXLayer(this);
    // 1) 引擎与道具（默认装载「成功」剧本——Bug2：成功/失败双演示）
    this.loadScript(DEMO_SUCCESS, true);
    this.createHud();
    this.bindEngineEvents();
    this.refreshSpeedVisual();
  }

  /** 装载演示剧本（重建引擎世界与精灵；withGoal=成功剧本挂球进筐判定） */
  private loadScript(entries: PropEntry[], withGoal: boolean): void {
    this.sim?.stop();
    this.sim = new SimulationEngine({ mode: 'level', timeoutMs: 60_000 });
    this.sim.loadProps(entries);
    if (withGoal) {
      const doc = {
        version: 2,
        id: '_lab', source: 'official', name: '实验', chapter: 0,
        scene: { width: 1280, height: 720 },
        fixed: entries,
        inventory: [], goals: [{ type: 'ball_in_basket', actor: 'ball1', target: 'shelf1', desc: '球进筐' }],
        starRule: { maxParts: 0 }, hints: { text: '' },
      } as unknown as LevelDoc;
      this.sim.setGoalChecker(new LevelGoalChecker(doc, this.sim.events));
    }
    wireSimFX(this, this.sim, this.fx);
    this.failReason = '';
    // 精灵表重建
    for (const img of this.sprites.values()) img.destroy();
    this.sprites.clear();
    for (const prop of this.sim.getProps()) {
      const view = PROP_REGISTRY[prop.type].viewOf(prop.entry);
      const img = this.add
        .image(prop.entry.x, prop.entry.y, view.texture)
        .setRotation(Phaser.Math.DegToRad(prop.entry.angle ?? 0));
      this.sprites.set(prop.pid, img);
    }
    this.tipText?.setText('剧本已装载。点 ▶ 启动 观察结局！');
  }

  /** 创建 HUD：状态徽标 / 时钟 / 倒计时 / 提示 / 按钮排 */
  private createHud(): void {
    this.stateText = this.add
      .text(24, 14, '', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: 'bold', color: `#${PALETTE.outline.toString(16)}` })
      .setOrigin(0, 0);
    this.clockText = this.add
      .text(24, 46, '', { fontFamily: FONT_FAMILY, fontSize: '14px', color: `#${PALETTE.darkGray.toString(16)}` })
      .setOrigin(0, 0);

    this.countdownText = this.add
      .text(640, 240, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '120px',
        fontStyle: 'bold',
        color: `#${PALETTE.techBlue.toString(16)}`,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.tipText = this.add
      .text(640, 616, '', { fontFamily: FONT_FAMILY, fontSize: '17px', color: `#${PALETTE.darkGray.toString(16)}` })
      .setOrigin(0.5);

    // ---- 按钮排（触屏热区 ≥ 48px 高度，遵守 D16 移动兼容基线②）----
    this.makeButton(110, 672, 104, 48, '▶ 启动', PALETTE.grassGreen, () => this.sim.start());
    this.makeButton(228, 672, 104, 48, '⏹ 停止', PALETTE.cherryRed, () => this.sim.stop());
    // Bug2：成功/失败双演示剧本（成功剧本挂目标判定：球进筐 → SUCCESS）
    this.makeButton(346, 672, 118, 48, '🎬 成功演示', PALETTE.grassGreen, () => this.loadScript(DEMO_SUCCESS, true));
    this.makeButton(478, 672, 118, 48, '🎬 失败演示', PALETTE.cherryRed, () => this.loadScript(DEMO_FAIL, false));
    SPEED_OPTIONS.forEach((opt, i) => {
      const x = 640 + i * 105;
      const rect = this.makeButton(x, 672, 95, 48, opt.label, PALETTE.metalGray, () => {
        this.sim.setSpeed(opt.speed);
        this.refreshSpeedVisual();
      });
      this.speedRects.push({ speed: opt.speed, rect });
    });
    this.makeButton(1170, 672, 150, 48, '↩ 返回主页', PALETTE.techBlue, () => this.scene.start(SCENE_KEYS.HOME));
  }

  /**
   * 通用按钮：圆角色块 + 居中文字 + 按下反馈
   * @param x 中心 x
   * @param y 中心 y
   * @param w 宽
   * @param h 高（≥48 触屏热区）
   * @param label 文案
   * @param color 底色
   * @param onDown 点击回调
   * @returns 色块对象（供选中态控制）
   */
  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    onDown: () => void,
  ): Phaser.GameObjects.Rectangle {
    const rect = this.add
      .rectangle(x, y, w, h, color)
      .setStrokeStyle(STROKE_WIDTH, darken(color, 0.4))
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        onDown();
        // 轻微按压反馈
        this.tweens.add({ targets: rect, scale: 0.94, duration: 60, yoyo: true });
      });
    this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: `#${PALETTE.highlightWhite.toString(16)}`,
      })
      .setOrigin(0.5)
      // 文字不拦截指针事件，点击穿透到下方色块
      .setInteractive({ useHandCursor: false })
      .disableInteractive();
    return rect;
  }

  /** 订阅引擎事件，驱动提示文案与失败原因 */
  private bindEngineEvents(): void {
    this.sim.events.on('propOutOfBounds', (e) => {
      this.failReason = `小球「${e.pid}」离家出走啦（飞出画布）`;
    });
    this.sim.events.on('runTimeout', () => {
      this.failReason = '超时啦（本轮时间到）';
    });
    this.sim.events.on('stateChanged', ({ to }) => {
      if (to === 'COUNTDOWN' || to === 'FREE_RUN') {
        this.failReason = '';
      }
      switch (to) {
        case 'EDITING':
          this.tipText
            .setText('编辑态：点 ▶ 启动 开始模拟（停止后小球会精确回到摆放位）')
            .setColor(`#${PALETTE.darkGray.toString(16)}`);
          break;
        case 'COUNTDOWN':
          this.tipText.setText('准备……').setColor(`#${PALETTE.techBlue.toString(16)}`);
          break;
        case 'RUNNING':
          this.tipText.setText('运行中：观察小球的连锁反应吧！').setColor(`#${PALETTE.grassGreen.toString(16)}`);
          break;
        case 'FAILED':
          this.tipText
            .setText(`本轮结束：${this.failReason || '失败'}。失败不惩罚，⏹ 停止可返回编辑态`)
            .setColor(`#${PALETTE.cherryRed.toString(16)}`);
          break;
        case 'SUCCESS':
          this.tipText.setText('目标达成！（正式目标判定在步骤 4 接入）').setColor(`#${PALETTE.grassGreen.toString(16)}`);
          break;
        case 'FREE_RUN':
          this.tipText.setText('自由实验中').setColor(`#${PALETTE.grassGreen.toString(16)}`);
          break;
      }
    });
  }

  /** 倍速按钮选中态：当前档位高亮，其余半透明 */
  private refreshSpeedVisual(): void {
    for (const item of this.speedRects) {
      item.rect.setAlpha(item.speed === this.sim.speed ? 1 : 0.55);
    }
  }

  /**
   * 每帧：推进一步逻辑步 + 把刚体位姿同步到精灵 + 刷新 HUD
   * （渲染层只读不写物理量——§7.1 解耦纪律）
   */
  override update(): void {
    this.sim.step();

    for (const prop of this.sim.getProps()) {
      const img = this.sprites.get(prop.pid);
      if (img) {
        img.setPosition(prop.body.position.x, prop.body.position.y);
        img.setRotation(prop.body.angle);
      }
    }

    const s = this.sim.state;
    const countdownSec = Math.ceil(this.sim.countdownRemainingMs / 1000);
    this.stateText.setText(s === 'COUNTDOWN' ? `状态: ${s}（${countdownSec}）` : `状态: ${s}`);
    this.clockText.setText(
      `步进 ${this.sim.tick} · 虚拟运行 ${(this.sim.virtualRunMs / 1000).toFixed(1)}s · 倍速 ${this.sim.speed}×`,
    );
    this.countdownText.setVisible(s === 'COUNTDOWN').setText(String(Math.max(1, countdownSec)));
  }
}
