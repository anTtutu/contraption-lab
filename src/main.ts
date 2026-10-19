/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: main.ts
 * -----------------------------------------------------------------------------
 * 用途: 游戏入口 —— 创建 Phaser.Game 实例
 *       逻辑分辨率 1280×720（设计文档 §10.1），FIT 自适应缩放，
 *       平板横屏 / 桌面浏览器均可获得等比画面。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Phaser from 'phaser';
import { PALETTE } from './core/palette';
import { MemoryProgressStore } from './level/ProgressStore';
import { SoundKit } from './fx/SoundKit';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { EngineLabScene } from './scenes/EngineLabScene';
import { ChapterScene } from './scenes/ChapterScene';
import { LevelScene } from './scenes/LevelScene';
import { EditorScene } from './scenes/EditorScene';
import { MyLevelsScene } from './scenes/MyLevelsScene';
import { SandboxScene } from './scenes/SandboxScene';

/** 游戏逻辑分辨率（16:9，与关卡画布尺寸一致） */
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

/** Phaser 游戏全局配置 */
const config: Phaser.Types.Core.GameConfig = {
  // AUTO：优先 WebGL，环境不支持时自动回退 Canvas
  type: Phaser.AUTO,
  // 挂载到 index.html 的 #game 容器
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // 画布底色 = 调色板背景木墙，与页面 CSS 底色一致避免加载闪烁
  backgroundColor: PALETTE.bgWall,
  scale: {
    // FIT：保持 16:9 等比缩放铺满窗口，不裁切不变形
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 场景注册表：Boot → Home(章节地图) → Chapter/Level（闯关）；Editor/MyLevels/Sandbox（创作与实验）
  scene: [BootScene, HomeScene, EngineLabScene, ChapterScene, LevelScene, EditorScene, MyLevelsScene, SandboxScene],
};

// 全局进度存储：步骤 4 用内存实现，步骤 5 换 SQLite（接口不变，场景零改动）
const game = new Phaser.Game(config);
game.registry.set('progress', new MemoryProgressStore());
// 调试句柄：控制台可查 registry/Game（window.__clab）
((window as unknown as Record<string, unknown>).__clab = { registry: game.registry, game });

// 步骤 8：首次用户手势解锁 WebAudio（D16 移动兼容基线④）+ canvas 点击咔哒反馈
const sound = SoundKit.get();
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true, once: false });
window.addEventListener(
  'pointerdown',
  (e) => {
    if ((e.target as HTMLElement)?.tagName === 'CANVAS') sound.click();
  },
  { capture: true },
);
