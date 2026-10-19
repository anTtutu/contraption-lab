/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: types.ts
 * -----------------------------------------------------------------------------
 * 用途: 关卡文档类型定义（设计文档 §12 Level JSON v2 的 TS 形态）
 *       官方关卡 JSON 与编辑器产物共用此结构；校验器（§12.3）据此检查。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { PropEntry } from '../engine/PropBase';

/** 关卡文档（Level JSON v2） */
export interface LevelDoc {
  /** 格式版本，当前 2 */
  version: number;
  /** 关卡 ID：官方 L{章}-{序} / 自定义 u-{id} */
  id: string;
  source: 'official' | 'user';
  name: string;
  /** 章节 1-7；自定义关为 0 */
  chapter: number;
  author?: string;
  scene: { width: number; height: number; bg?: string };
  /** 场景预置道具（通常静态结构 + 运动体 + 目标物） */
  fixed: PropEntry[];
  /** 玩家托盘：可用道具与数量（count -1 = 无限） */
  inventory: Array<{ type: string; count: number; variant?: string; meta?: Record<string, unknown> }>;
  /** 禁放区（红色虚线区域，玩家不可放置） */
  forbiddenZones?: Array<{ x: number; y: number; w: number; h: number; tip?: string }>;
  /** 目标列表（全部达成才算通关） */
  goals: LevelGoal[];
  /** 星级规则：★2 的道具数限额 */
  starRule: { maxParts: number };
  /** 三级提示（设计文档 §6.3） */
  hints: {
    text: string;
    /** L2 幽灵答案：关键摆放（半透明展示） */
    ghost?: PropEntry[];
    /** L3 参考解快照：完整摆放（演示动画 + 物理回归测试用） */
    solution?: PropEntry[];
  };
  meta?: { timeout?: number; verified?: boolean };
}

/** 关卡目标（三种判定形态，§5.7） */
export type LevelGoal =
  | { type: 'ball_in_basket'; actor: string; target: string; desc: string }
  | { type: 'balloon_popped'; target: string; desc: string }
  | { type: 'bell_rung'; target: string; desc: string };
