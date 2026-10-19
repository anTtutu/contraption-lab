/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: LevelRegression.test.ts
 * -----------------------------------------------------------------------------
 * 用途: 官方关卡物理回归（设计文档 §13 的承诺兑现）：
 *       每关加载「场景固定道具 + 参考解快照」→ 无渲染跑 2400 步 →
 *       断言目标达成（SUCCESS）。任何不可通关的关卡在此直接暴露。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/engine/SimulationEngine';
import { LevelGoalChecker } from '../src/level/LevelGoalChecker';
import type { LevelDoc } from '../src/level/types';
import chapter1 from '../levels/official/chapter1.json';
import chapter2 from '../levels/official/chapter2.json';
import chapter3 from '../levels/official/chapter3.json';
import chapter4 from '../levels/official/chapter4.json';
import chapter5 from '../levels/official/chapter5.json';
import chapter6 from '../levels/official/chapter6.json';
import chapter7 from '../levels/official/chapter7.json';

/** 章节关卡注册表（新增章节在此追加） */
const CHAPTERS: LevelDoc[][] = [chapter1 as unknown as LevelDoc[], chapter2 as unknown as LevelDoc[], chapter3 as unknown as LevelDoc[], chapter4 as unknown as LevelDoc[], chapter5 as unknown as LevelDoc[], chapter6 as unknown as LevelDoc[], chapter7 as unknown as LevelDoc[]];

/** 回归步数上限：2400 步 = 40s 虚拟时长（覆盖 90s 超时关的常规通解时长） */
const MAX_STEPS = 2400;

for (let ci = 0; ci < CHAPTERS.length; ci++) {
  const levels = CHAPTERS[ci];
  describe(`第 ${ci + 1} 章关卡物理回归`, () => {
    for (const doc of levels) {
      it(`${doc.id}「${doc.name}」：参考解可通关`, () => {
        const engine = new SimulationEngine({
          mode: 'level',
          timeoutMs: ((doc.meta?.timeout ?? 60) + 10) * 1000,
        });
        engine.loadProps([...doc.fixed, ...(doc.hints.solution ?? [])]);
        engine.setGoalChecker(new LevelGoalChecker(doc, engine.events));
        engine.start();
        for (let i = 0; i < MAX_STEPS && engine.state !== 'SUCCESS'; i++) {
          engine.step();
        }
        // 失败时输出球与筐的落点，辅助关卡坐标调优
        if (engine.state !== 'SUCCESS') {
          for (const goal of doc.goals) {
            if (goal.type !== 'ball_in_basket') continue;
            const ball = engine.getProp(goal.actor);
            const bk = engine.getProp(goal.target);
            console.log(
              `${doc.id} 未通关: ball=(${ball?.body.position.x.toFixed(0)},${ball?.body.position.y.toFixed(0)}) ` +
                `basket=(${bk?.entry.x},${bk?.entry.y}) state=${engine.state}`,
            );
          }
        }
        expect(engine.state, `${doc.id} 参考解未达成目标`).toBe('SUCCESS');
      });
    }
  });
}
