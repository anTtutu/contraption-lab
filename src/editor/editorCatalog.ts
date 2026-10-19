/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: editorCatalog.ts
 * -----------------------------------------------------------------------------
 * 用途: 编辑器可放置道具目录 + 默认托盘目录（设计文档 §8 道具库分类页签的精简版）
 *       面向小创作者收窄：不是全部 33 类都适合手工摆放（如绳索途经点复杂参数），
 *       此处挑出直觉性强、易搭配的核心子集。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 可放置目录条目 */
export interface CatalogItem {
  type: string;
  /** 展示名 */
  label: string;
  /** 变体（球类） */
  variant?: string;
  /** 分类：运动体 / 结构 / 机构 / 能源 / 目标 */
  category: string;
}

/** 画布可放置目录（分类顺序即面板分组顺序） */
export const PLACEABLE: CatalogItem[] = [
  // 运动体
  { type: 'ball', label: '木球', variant: 'wood', category: '运动体' },
  { type: 'ball', label: '钢球', variant: 'steel', category: '运动体' },
  { type: 'ball', label: '弹力球', variant: 'bouncy', category: '运动体' },
  { type: 'ball', label: '乒乓球', variant: 'pingpong', category: '运动体' },
  { type: 'ball', label: '保龄球', variant: 'bowling', category: '运动体' },
  { type: 'balloon', label: '氦气球', category: '运动体' },
  { type: 'hamster', label: '咕噜', category: '运动体' },
  // 结构
  { type: 'plank', label: '木板', category: '结构' },
  { type: 'shelf', label: '平台', category: '结构' },
  { type: 'pillar', label: '支柱', category: '结构' },
  { type: 'wedge', label: '楔形块', category: '结构' },
  { type: 'iceBlock', label: '冰砖', category: '结构' },
  { type: 'bouncyPad', label: '弹力垫', category: '结构' },
  { type: 'trampoline', label: '蹦床', category: '结构' },
  { type: 'curvedTrack', label: '曲面轨道', category: '结构' },
  { type: 'seesaw', label: '跷跷板', category: '结构' },
  // 机构
  { type: 'motor', label: '电动机', category: '机构' },
  { type: 'gear', label: '齿轮(中)', category: '机构' },
  { type: 'conveyor', label: '传送带', category: '机构' },
  { type: 'turntable', label: '转盘', category: '机构' },
  { type: 'rack', label: '齿条', category: '机构' },
  // 能源
  { type: 'candle', label: '蜡烛', category: '能源' },
  { type: 'springLauncher', label: '弹簧发射器', category: '能源' },
  { type: 'bomb', label: '礼花炸弹', category: '能源' },
  { type: 'fan', label: '风扇', category: '能源' },
  { type: 'magnet', label: '磁铁', category: '能源' },
  { type: 'pressSwitch', label: '按压开关', category: '能源' },
  { type: 'rocket', label: '火箭', category: '能源' },
  // 目标
  { type: 'basket', label: '篮筐', category: '目标' },
  { type: 'balloonTarget', label: '气球靶', category: '目标' },
  { type: 'bell', label: '铃铛', category: '目标' },
];

/** 默认新关卡托盘（数量可再在面板调整；-1 = 无限） */
export const DEFAULT_INVENTORY: Array<{ type: string; count: number; variant?: string }> = [
  { type: 'plank', count: 3 },
  { type: 'wedge', count: 1 },
  { type: 'pillar', count: 2 },
  { type: 'ball', count: 1, variant: 'steel' },
  { type: 'ball', count: 1, variant: 'wood' },
  { type: 'bouncyPad', count: 1 },
  { type: 'conveyor', count: 1 },
];

/** 目标类型循环表（目标面板的「换一种」按钮） */
export const GOAL_TYPES = [
  { type: 'ball_in_basket', label: '球进篮筐' },
  { type: 'balloon_popped', label: '戳爆气球靶' },
  { type: 'bell_rung', label: '敲响铃铛' },
] as const;
