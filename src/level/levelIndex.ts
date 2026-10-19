/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: levelIndex.ts
 * -----------------------------------------------------------------------------
 * 用途: 官方关卡索引 —— 打包期 import 全部章节 JSON，提供按 ID/章节检索。
 *       新增章节：① levels/official/chapterN.json ② 在 CHAPTER_FILES 追加 import。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { LevelDoc } from './types';
import chapter1 from '../../levels/official/chapter1.json';
import chapter2 from '../../levels/official/chapter2.json';
import chapter3 from '../../levels/official/chapter3.json';
import chapter4 from '../../levels/official/chapter4.json';
import chapter5 from '../../levels/official/chapter5.json';
import chapter6 from '../../levels/official/chapter6.json';
import chapter7 from '../../levels/official/chapter7.json';

/** 章节文件注册表（顺序即章节号-1） */
const CHAPTER_FILES: LevelDoc[][] = [chapter1 as unknown as LevelDoc[], chapter2 as unknown as LevelDoc[], chapter3 as unknown as LevelDoc[], chapter4 as unknown as LevelDoc[], chapter5 as unknown as LevelDoc[], chapter6 as unknown as LevelDoc[], chapter7 as unknown as LevelDoc[]];

/** 全部官方关卡（平铺） */
export const ALL_LEVELS: LevelDoc[] = CHAPTER_FILES.flat();

/** 章节元信息（章节地图渲染用） */
export interface ChapterMeta {
  chapter: number;
  title: string;
  concept: string;
  /** 章节数据是否已实装（2-7 章数据制作中） */
  ready: boolean;
  /** 知识卡正文（章节页 📖 弹窗展示，设计文档 §6.1） */
  card: string[];
}

/** 七章元信息（设计文档 §6.1） */
export const CHAPTERS: ChapterMeta[] = [
  {
    chapter: 1, title: '自由落体与斜面', concept: '重力 · 摩擦', ready: true,
    card: [
      '🌍 重力：地球会把所有东西往下拉，越重的物体砸下去越有劲儿。',
      '📐 斜面：斜坡能让竖直下落的东西「拐弯」，慢慢加速滑下去。',
      '🧊 摩擦：冰面几乎不打折扣地滑，粗糙的木板会让球慢下来。',
      '💡 小实验：同样高度放球，比较它滚到坡底的速度！',
    ],
  },
  {
    chapter: 2, title: '弹力乐园', concept: '弹性碰撞', ready: true,
    card: [
      '🏀 弹性：球撞到硬东西会被弹回来，越弹的球跳得越高。',
      '🛝 弹力垫：把下落的速度「存起来」再还给它——球能弹回接近原来的高度！',
      '🎯 打靶：一直弹跳的球最适合去撞气球靶。',
      '💡 小实验：让球从更高处落下，看看能弹多高！',
    ],
  },
  {
    chapter: 3, title: '齿轮与传动', concept: '转速与扭矩', ready: true,
    card: [
      '⚙️ 齿轮：大齿轮转一圈，小齿轮要转好几圈——大带小，越带越快！',
      '🔄 转向：两个咬合的齿轮转向永远相反。',
      '🛞 传送带：把转动的力变成「搬运力」，稳稳地把东西送过去。',
      '💡 小实验：数一数大齿轮转 1 圈时小齿轮转了几圈！',
    ],
  },
  {
    chapter: 4, title: '杠杆与滑轮', concept: '杠杆 · 省力', ready: true,
    card: [
      '⚖️ 杠杆：一根能转的板子——一头压下去，另一头就翘上天！',
      '🔨 力气与距离：想翘得更高，就要从更高处砸下去。',
      '🎪 炮台原理：重锤砸跷跷板一端，另一端的轻物体就飞出去了。',
      '💡 小实验：把重锤放得越高，看木球飞得是不是越远！',
    ],
  },
  {
    chapter: 5, title: '热与延时', concept: '时间链', ready: true,
    card: [
      '🕯️ 延时：有些机关不会立刻动——蜡烛要烧一会儿，炸弹有引信。',
      '⏱️ 掐时间：让球「正好」在机关发动的时刻到达，是最高级的技巧！',
      '💥 连锁：一个炸弹能点着旁边的炸弹——礼花一环接一环！',
      '💡 小实验：数秒！预测炸弹几秒后爆炸。',
    ],
  },
  {
    chapter: 6, title: '风与浮力', concept: '气流 · 升力', ready: true,
    card: [
      '🌬️ 风：看不见的空气推力，能把轻轻的东西吹走。',
      '🎈 浮力：氦气球比空气轻，会一直往天上飞。',
      '🪶 轻重之别：风能吹动乒乓球，却吹不动保龄球。',
      '💡 小实验：观察乒乓球在风里飘过的路线！',
    ],
  },
  {
    chapter: 7, title: '咕噜大机关', concept: '综合运用', ready: true,
    card: [
      '🧩 综合：把学过的所有机关连起来——斜面、弹力、齿轮、杠杆、延时、风！',
      '🔗 连锁思维：先想「第一步发生什么」，再想「接下来发生什么」。',
      '🏆 发明家精神：失败不可怕，每一次调整都让你更接近成功！',
      '💡 现在：去编辑器里创造属于你自己的大机关吧！',
    ],
  },
];

/** 按 ID 查关卡 */
export function findLevel(levelId: string): LevelDoc | undefined {
  return ALL_LEVELS.find((l) => l.id === levelId);
}

/** 取某章关卡列表（未实装章节返回空数组） */
export function chapterLevels(chapter: number): LevelDoc[] {
  return CHAPTER_FILES[chapter - 1] ?? [];
}
