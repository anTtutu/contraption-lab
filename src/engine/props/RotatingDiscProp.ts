/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: RotatingDiscProp.ts
 * -----------------------------------------------------------------------------
 * 用途: 旋转盘族道具（设计文档 §5.3 传动机构）：电动机 / 齿轮 / 皮带轮 / 凸轮 / 转盘
 *       统一实现为「中心销悬置的动态圆盘 + 每步设定角速度」：
 *       - 动态体：旋转时靠摩擦真实带动接触物（转盘运球、轮子拨球）
 *       - 中心销：位置固定，只转不移
 *       - collisionFilter：齿轮/皮带轮不与同类互撞（啮合是运动学联动，不做真实齿碰撞
 *         ——§10.3 既定稳定化方案），但与球等普通物体正常碰撞
 *       联动规则（onRunStart 一次性预计算，确定性）：
 *       - 齿轮啮合：中心距 ≈ r1+r2（±5px）→ ω_副 = -ω_主 × r_主/r_副
 *       - 皮带联动：meta.beltWith 指定 → ω_副 = +ω_主 × r_主/r_副（同向，距离不限）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { PropBase, PropEntry } from '../PropBase';
import { TUNING } from '../PhysicsTuning';
import type { StepContext } from '../StepContext';

/** 齿轮类碰撞类别位：同类之间不互撞（mask 排除） */
const DISC_CATEGORY = 0x0002;
const DEFAULT_CATEGORY = 0x0001;

/** 齿轮三档半径（px，设计文档 §5.3：90/60/40） */
export const GEAR_RADII = { large: 90, middle: 60, small: 40 } as const;
export type GearSize = keyof typeof GEAR_RADII;

/** 驱动档位 → 角速度（rad/步）：2 档≈0.5 转/秒，儿童可见的「慢中快」 */
const DRIVE_OMEGA = [0.03, 0.06, 0.1] as const;

/** 旋转盘族类型集合（联动预计算时识别同类） */
const DISC_TYPES: ReadonlySet<string> = new Set(['motor', 'gear', 'pulley', 'cam', 'turntable']);

/** 判断道具类型是否属于旋转盘族 */
export function isRotatingDiscType(type: string): boolean {
  return DISC_TYPES.has(type);
}

/** 各旋转类型的自身属性（半径/自驱角速度/摩擦） */
interface DiscSpec {
  radius: number;
  /** 自驱角速度（rad/步）；undefined = 纯从动件 */
  selfOmega?: number;
  friction: number;
}

/** 类型 → 规格表 */
function discSpecOf(type: string, meta: Record<string, unknown> | undefined): DiscSpec {
  switch (type) {
    case 'motor':
      // 电机档位 1-3（缺省 2 档），方向 meta.dir ±1（缺省顺时针）
      return {
        radius: 50,
        selfOmega: DRIVE_OMEGA[Math.min(2, Math.max(0, ((meta?.speed as number) ?? 2) - 1))] * (((meta?.dir as number) ?? 1) || 1),
        friction: TUNING.friction.grippy,
      };
    case 'gear': {
      const size = (meta?.size as GearSize) ?? 'middle';
      return { radius: GEAR_RADII[size], friction: TUNING.friction.normal };
    }
    case 'pulley':
      return { radius: 45, friction: TUNING.friction.normal };
    case 'cam':
      return { radius: 50, selfOmega: 0.04 * (((meta?.dir as number) ?? 1) || 1), friction: TUNING.friction.normal };
    case 'turntable':
      return { radius: 110, selfOmega: 0.02 * (((meta?.dir as number) ?? 1) || 1), friction: TUNING.friction.grippy };
    default:
      return { radius: 50, friction: TUNING.friction.normal };
  }
}

export class RotatingDiscProp extends PropBase {
  /** 本盘规格（半径/自驱/摩擦） */
  private readonly spec: DiscSpec;
  /** 预计算目标角速度（rad/步；onRunStart 时由联动图推导） */
  private targetOmega = 0;

  constructor(entry: PropEntry) {
    super(entry);
    this.spec = discSpecOf(entry.type, entry.meta);
    // 中心销：位置固定仅旋转
    const pin = Matter.Constraint.create({
      pointA: { x: entry.x, y: entry.y },
      bodyB: this.body,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 1,
    });
    this.constraints.push(pin);
  }

  /** 盘面半径（注册表/编辑器/联动计算取用） */
  get radius(): number {
    return this.spec.radius;
  }

  /** 当前目标角速度（联动测试取用） */
  get currentOmega(): number {
    return this.targetOmega;
  }

  /** 是否自驱盘（电机/凸轮/转盘） */
  get selfDriven(): boolean {
    return this.spec.selfOmega !== undefined;
  }

  protected get defaultStatic(): boolean {
    return false; // 销悬动态体
  }

  protected buildBody(): Matter.Body {
    // 注意：buildBody 在基类构造期执行，禁止读子类字段——规格从 entry 现算
    const spec = discSpecOf(this.entry.type, this.entry.meta);
    return Matter.Bodies.circle(this.entry.x, this.entry.y, spec.radius, {
      density: 0.002,
      friction: spec.friction,
      frictionAir: 0,
      // 与同类圆盘互不碰撞（运动学啮合），与普通物体正常碰撞
      collisionFilter: { category: DISC_CATEGORY, mask: DEFAULT_CATEGORY },
      isStatic: this.isStaticFinal,
    });
  }

  /**
   * 起跑时一次性预计算联动角速度：自驱盘定速后，沿啮合/皮带关系
   * 松弛迭代传播（确定性：固定顺序遍历，链式/分叉必收敛；
   * 环形啮合属非法摆放，迭代轮数以盘数为界自然有界）。
   */
  override onRunStart(): void {
    if (this.spec.selfOmega !== undefined) {
      this.targetOmega = this.spec.selfOmega;
    }
    const discs = (this.engine?.getProps() ?? []).filter(
      (p): p is RotatingDiscProp => isRotatingDiscType(p.type) && p instanceof RotatingDiscProp,
    );
    for (let iter = 0; iter < discs.length; iter++) {
      let changed = false;
      for (const driver of discs) {
        if (!driver.selfDriven) continue;
        for (const follower of discs) {
          if (follower === driver || follower.selfDriven) continue;
          // 皮带优先（显式声明，同向），其次齿轮啮合中心距判定（反向）
          const isBelt = follower.entry.meta?.beltWith === driver.pid || driver.entry.meta?.beltWith === follower.pid;
          const dist = Math.hypot(follower.entry.x - driver.entry.x, follower.entry.y - driver.entry.y);
          const isMesh = Math.abs(dist - (driver.spec.radius + follower.spec.radius)) <= 5;
          if (!isBelt && !isMesh) continue;
          const omega = driver.targetOmega * (driver.spec.radius / follower.spec.radius) * (isBelt ? 1 : -1);
          if (omega !== follower.targetOmega) {
            follower.targetOmega = omega;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  override onFixedStep(_ctx: StepContext): void {
    // 钉住角速度：主动机构恒速输出；从动件运动学联动（免真实齿碰撞抖动）
    Matter.Body.setAngularVelocity(this.body, this.targetOmega);
  }
}
