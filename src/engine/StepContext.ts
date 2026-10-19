/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: StepContext.ts
 * -----------------------------------------------------------------------------
 * 用途: 道具固定步回调上下文（类型独立成文件，避免 PropBase ↔ SimulationEngine
 *       运行时循环依赖；SimulationEngine 仅以 import type 出现，编译期擦除）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { SimulationEngine } from './SimulationEngine';

/** 每个固定物理步传给道具 onFixedStep 的上下文 */
export interface StepContext {
  /** 引擎引用：道具可读取世界状态、调用 explode/removeConstraint 等原语 */
  engine: SimulationEngine;
  /** 信号通道状态表（按压开关 → 电机/磁铁 等接收器共享） */
  channels: Map<string, boolean>;
}
