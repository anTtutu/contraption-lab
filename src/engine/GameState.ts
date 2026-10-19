/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: GameState.ts
 * -----------------------------------------------------------------------------
 * 用途: 模拟状态机纯逻辑层（设计文档 §10.4）
 *       只定义「状态集合 + 合法迁移表」，不含任何引擎副作用，
 *       保证迁移规则可独立单测；SimulationEngine 在每次迁移前调用 canTransition 校验。
 *
 * 状态流转全景：
 *   EDITING ──start──▶ COUNTDOWN ──倒计时归零──▶ RUNNING ──达成──▶ SUCCESS
 *      ▲                   │                        │                  │
 *      │                   │                        ├─超时/出界──▶ FAILED
 *      └───────stop（复位到编辑摆放位）─────────────┴──────────────────┘
 *   沙盒模式：EDITING ──start──▶ FREE_RUN（无 SUCCESS/FAILED，出界仅播报）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 模拟状态枚举 */
export type GameState =
  | 'EDITING' // 编辑态：物理世界静止，可拖放/旋转/删除道具
  | 'COUNTDOWN' // 倒计时态：3-2-1，物理仍未启动
  | 'RUNNING' // 运行态：物理以固定步长推进，道具锁定
  | 'SUCCESS' // 达成目标（仅关卡模式）
  | 'FAILED' // 超时/出界等失败标记（设计文档 §6.4：提示但不终结，stop 随时回编辑）
  | 'FREE_RUN'; // 沙盒自由运行态：无目标、无超时

/** 全部状态集合（单测遍历用） */
export const GAME_STATES: readonly GameState[] = [
  'EDITING',
  'COUNTDOWN',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'FREE_RUN',
];

/** 运行模式：level=闯关（有目标/超时），sandbox=沙盒自由实验 */
export type EngineMode = 'level' | 'sandbox';

/**
 * 合法迁移表：key = 源状态，value = 允许到达的状态列表。
 * 表外的一切迁移都是程序错误（引擎会抛异常，而不是静默放过）。
 */
const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  EDITING: ['COUNTDOWN', 'FREE_RUN'],
  COUNTDOWN: ['RUNNING', 'EDITING'],
  RUNNING: ['SUCCESS', 'FAILED', 'EDITING'],
  FREE_RUN: ['EDITING'],
  SUCCESS: ['EDITING'],
  FAILED: ['EDITING'],
};

/**
 * 判断状态迁移是否合法
 * @param from 源状态
 * @param to 目标状态
 * @returns true = 允许迁移
 */
export function canTransition(from: GameState, to: GameState): boolean {
  return TRANSITIONS[from].includes(to);
}
