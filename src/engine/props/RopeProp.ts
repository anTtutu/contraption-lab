/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: RopeProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 绳索家族（设计文档 §5.4）：吊绳（可燃）/ 链条，以及未来的滑轮组路径绳。
 *       实现（§10.3 既定）：折线路径 → 每段切分为小刚体链节（≤12 节）
 *       + 邻接约束（stiffness 0.9 / damping 0.1）；中间途经点=滑轮锚点（世界钉）。
 *       可燃绳：ignite() 点燃 → 延时后移除指定节约束 → 绳断物落（§5.5 蜡烛联动）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import type { StepContext } from '../StepContext';

/** 链节尺寸（px） */
export const ROPE_LINK_WIDTH = 8;
export const ROPE_LINK_LENGTH = 26;
/** 单根绳最大节数（性能与稳定预算） */
export const ROPE_MAX_LINKS = 12;

export class RopeProp extends PropBase {
  /** 链节刚体（与 links 对齐；bodies[0] 即主 body） */
  private readonly linkBodies: Matter.Body[] = [];
  /** 邻接约束（constraints[0] = 首端世界锚点） */
  private readonly linkConstraints: Matter.Constraint[] = [];
  /** 每段途经点（首点=固定端，末点=自由端或第二固定端） */
  private readonly points: Array<{ x: number; y: number }>;
  /** 是否可燃 */
  readonly burnable: boolean;
  /** 烧断节序号（缺省中间节） */
  private readonly burnIndex: number;
  /** 点燃剩余步数（-1 = 未点燃） */
  private burnCountdown = -1;
  /** 已烧断 */
  private burned = false;

  constructor(entry: PropEntry) {
    super(entry);
    this.points = (entry.meta?.points as Array<{ x: number; y: number }>) ?? [
      { x: entry.x, y: entry.y - 100 },
      { x: entry.x, y: entry.y + 60 },
    ];
    this.burnable = (entry.meta?.burnable as boolean) ?? true;
    this.burnIndex = (entry.meta?.burnIndex as number) ?? -1;

    // ---- 沿折线切分链节 ----
    let prev: Matter.Body | null = null;
    for (let i = 0; i < this.points.length - 1; i++) {
      const from = this.points[i];
      const to = this.points[i + 1];
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const count = Math.max(1, Math.min(ROPE_MAX_LINKS, Math.round(dist / ROPE_LINK_LENGTH)));
      for (let j = 0; j < count; j++) {
        const t0 = j / count;
        const t1 = (j + 1) / count;
        const cx = from.x + (to.x - from.x) * ((t0 + t1) / 2);
        const cy = from.y + (to.y - from.y) * ((t0 + t1) / 2);
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const link = Matter.Bodies.rectangle(cx, cy, ROPE_LINK_WIDTH, ROPE_LINK_LENGTH, {
          density: 0.0008,
          frictionAir: 0.02,
          collisionFilter: { category: 0x0004, mask: 0x0001 }, // 绳节互不碰撞、与普通物体碰撞
          angle: ang + Math.PI / 2,
        });
        this.linkBodies.push(link);
        // 邻接约束：新节顶端 ↔ 上一节（或首端世界锚点）
        const constraint = Matter.Constraint.create({
          bodyA: prev ?? undefined,
          pointA: prev ? { x: 0, y: ROPE_LINK_LENGTH / 2 } : { x: from.x, y: from.y },
          bodyB: link,
          pointB: { x: 0, y: -ROPE_LINK_LENGTH / 2 },
          length: 2,
          stiffness: 0.9,
          damping: 0.1,
        });
        this.linkConstraints.push(constraint);
        prev = link;
      }
      // 途经点钉扎：非最后一段的段末钉在世界点上（模拟滑轮转向）
      if (i < this.points.length - 2) {
        const pin = Matter.Constraint.create({
          pointA: { x: to.x, y: to.y },
          bodyB: prev!,
          pointB: { x: 0, y: ROPE_LINK_LENGTH / 2 },
          length: 0,
          stiffness: 1,
        });
        this.linkConstraints.push(pin);
      }
    }

    // 登记到基类容器（引擎统一入世界；bodies[0] 为主刚体）
    for (const link of this.linkBodies) this.bodies.push(link);
    for (const c of this.linkConstraints) this.constraints.push(c);
  }

  /** 主刚体 = 占位传感器（真实链节在构造函数创建并入 bodies；
   *  buildBody 在基类构造期执行，只能从 entry 现算，禁止读子类字段） */
  protected get defaultStatic(): boolean {
    return true; // 占位主刚体恒静态（真实链节为动态）
  }

  protected buildBody(): Matter.Body {
    const pts = (this.entry.meta?.points as Array<{ x: number; y: number }>) ?? [
      { x: this.entry.x, y: this.entry.y - 100 },
      { x: this.entry.x, y: this.entry.y + 60 },
    ];
    return Matter.Bodies.circle(pts[0].x, pts[0].y, 1, { isStatic: true, isSensor: true });
  }

  /** 链节约束列表（测试/调试用） */
  get linkCount(): number {
    return this.linkBodies.length;
  }

  /** 是否已被烧断 */
  get isBurned(): boolean {
    return this.burned;
  }

  /**
   * 点燃（蜡烛邻近时调用）
   * @param delaySteps 燃烧倒计时步数（约 16.7ms/步）
   */
  ignite(delaySteps: number): void {
    if (!this.burnable || this.burned || this.burnCountdown >= 0) return;
    this.burnCountdown = delaySteps;
  }

  override onFixedStep(_ctx: StepContext): void {
    if (this.burnCountdown < 0 || this.burned) return;
    this.burnCountdown--;
    if (this.burnCountdown > 0) return;

    // ---- 烧断：移除目标节约束 ----
    const idx = this.burnIndex >= 0 && this.burnIndex < this.linkConstraints.length
      ? this.burnIndex
      : Math.floor(this.linkConstraints.length / 2);
    const target = this.linkConstraints[idx];
    if (target) {
      this.engine?.removeConstraint(target);
    }
    this.burned = true;
  }
}
