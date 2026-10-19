/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: GameState.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 状态机迁移规则单测 —— 锁死 §10.4 状态流转图，
 *       任何对 TRANSITIONS 表的改动导致非法通道打开会直接挂测试。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { canTransition, GAME_STATES } from '../src/engine/GameState';

describe('GameState 状态机迁移规则', () => {
  it('闯关主链路合法：编辑→倒计时→运行→成功→编辑', () => {
    expect(canTransition('EDITING', 'COUNTDOWN')).toBe(true);
    expect(canTransition('COUNTDOWN', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'SUCCESS')).toBe(true);
    expect(canTransition('SUCCESS', 'EDITING')).toBe(true);
  });

  it('失败与手动停止链路合法：运行→失败→编辑；运行→编辑；编辑→自由运行→编辑', () => {
    expect(canTransition('RUNNING', 'FAILED')).toBe(true);
    expect(canTransition('FAILED', 'EDITING')).toBe(true);
    expect(canTransition('RUNNING', 'EDITING')).toBe(true);
    expect(canTransition('EDITING', 'FREE_RUN')).toBe(true);
    expect(canTransition('FREE_RUN', 'EDITING')).toBe(true);
  });

  it('非法迁移：不能跳过倒计时、不能从终态直接再开跑', () => {
    expect(canTransition('EDITING', 'RUNNING')).toBe(false);
    expect(canTransition('EDITING', 'SUCCESS')).toBe(false);
    expect(canTransition('SUCCESS', 'RUNNING')).toBe(false);
    expect(canTransition('SUCCESS', 'COUNTDOWN')).toBe(false);
    expect(canTransition('FAILED', 'FREE_RUN')).toBe(false);
    expect(canTransition('FAILED', 'COUNTDOWN')).toBe(false);
    expect(canTransition('COUNTDOWN', 'SUCCESS')).toBe(false);
  });

  it('除 EDITING 外每个状态都有回到 EDITING 的出口（防死状态）', () => {
    for (const state of GAME_STATES) {
      if (state === 'EDITING') continue;
      expect(canTransition(state, 'EDITING')).toBe(true);
    }
    // EDITING 自环不合法（重复无意义）
    expect(canTransition('EDITING', 'EDITING')).toBe(false);
    expect(GAME_STATES.length).toBe(6);
  });
});
