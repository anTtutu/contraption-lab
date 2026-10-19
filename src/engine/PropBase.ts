/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: PropBase.ts
 * -----------------------------------------------------------------------------
 * 用途: 道具抽象基类 + 关卡道具条目/快照类型定义（设计文档 §12 PropEntry、§7.1 快照）
 *       职责边界：
 *       - PropEntry   = 关卡 JSON 里的静态配置（落库/落盘的数据形态）
 *       - PropBase    = 运行时道具实例（持有 Matter 刚体 + 编辑摆放基准）
 *       - PropSnapshot/EngineSnapshot = 运行中任意时刻的全量快照
 *         （编辑器试运行精确复位、未来回放/单步功能的基石）
 *       注意：基类构造函数会调用子类 buildBody()，因此子类的 buildBody
 *       只允许依赖 entry 参数与纯函数，禁止读取子类自有字段（尚未初始化）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import type { GameState } from './GameState';
import type { SimulationEngine } from './SimulationEngine';
import type { StepContext } from './StepContext';

/** 关卡数据中的道具条目（与关卡 JSON 的 PropEntry 一一对应） */
export interface PropEntry {
  /** 道具实例唯一 ID（关卡内唯一，目标判定靠它引用） */
  pid: string;
  /** 道具类型 Key（必须已在 propRegistry 注册） */
  type: string;
  /** 摆放中心点 x（画布坐标） */
  x: number;
  /** 摆放中心点 y（画布坐标） */
  y: number;
  /** 摆放角度（度，顺时针为正），缺省 0 */
  angle?: number;
  /** 整体缩放，缺省 1 */
  scale?: number;
  /** 变体 Key（如球类：wood/steel/bouncy），缺省由道具类型决定 */
  variant?: string;
  /** 是否静态（不可被推动）；缺省由道具类型的 defaultStatic 决定 */
  isStatic?: boolean;
  /** 道具专属参数（电机转速/风扇风力等，步骤 3 起按道具启用） */
  meta?: Record<string, unknown>;
}

/**
 * 单个道具的运行时快照：位姿 + 隐式速度 + 状态位。
 *
 * ⚠️ 关键设计：速度不直接存 velocity，而是存 positionPrev/anglePrev——
 * Matter 在碰撞求解阶段会直接改写 body.velocity 与 positionPrev（隐式速度），
 * 下一步积分消费的是 positionPrev/anglePrev，后者才是权威续跑状态。
 *
 * ⚠️ 能力边界（诚实声明）：engine.pairs 的接触暖启动冲量跨步持久且不可序列化
 * （Matter 无对应 API），因此「中途快照恢复」的语义是【确定性重放】——
 * 同一快照恢复必得同一结果，但与「未中断的连续运行」之间存在经弹跳混沌放大的
 * 微小偏差（实测 160 步 < 15px，视觉回放无感）。编辑位复位（resetToEntry）
 * 不受此影响，仍为逐位精确赋值。
 */
export interface PropSnapshot {
  pid: string;
  /** 中心点坐标（px） */
  x: number;
  y: number;
  /** 上一帧位置 x（隐式线速度的权威状态） */
  positionPrevX: number;
  /** 上一帧位置 y（隐式线速度的权威状态） */
  positionPrevY: number;
  /** 旋转角（弧度，Matter 内部单位） */
  angle: number;
  /** 上一帧角度（隐式角速度的权威状态） */
  anglePrev: number;
  /** 静态标记（编辑/运行切换可能改静态性） */
  isStatic: boolean;
  /** 休眠标记（sleeping 开启时影响后续模拟轨迹） */
  isSleeping: boolean;
}

/** 整个模拟世界的快照 = 计数器 + 世界内全部道具快照 */
export interface EngineSnapshot {
  /** 全局步进计数（确定性回放的时间基准） */
  tick: number;
  /** 已累积的虚拟运行时长（受倍速影响） */
  virtualRunMs: number;
  /** 快照时刻的模拟状态 */
  state: GameState;
  /** 全部道具快照 */
  props: PropSnapshot[];
}

/**
 * 获取刚体的 Verlet 隐式速度字段（positionPrev / anglePrev）。
 * 说明：matter-js 运行时真实存在这两个字段（Body.update 直接读写），
 * 但 @types/matter-js 未声明，故集中在此断言访问，收敛类型豁免范围。
 * @param body 物理刚体
 * @returns 可读写的隐式状态引用
 */
function verletState(body: Matter.Body): { positionPrev: Matter.Vector; anglePrev: number } {
  return body as unknown as { positionPrev: Matter.Vector; anglePrev: number };
}

/**
 * 道具抽象基类：所有物理道具的公共协议
 * 子类只需实现三件事：形状（buildBody）、静态默认值（defaultStatic），
 * 其余快照/复位/编辑移动全部由基类统一实现。
 *
 * 生命周期钩子（全部可选，按需覆写）：
 * - onRunStart：每次启动（RUNNING/FREE_RUN 开始）调用一次
 * - onFixedStep：运行中每个固定物理步调用（电机/风扇/蜡烛等主动机构）
 * - onCollisionEnter：与其他道具发生碰撞时调用（开关/炸弹/易碎物）
 */
export abstract class PropBase {
  /** 道具实例唯一 ID（透传自 entry） */
  readonly pid: string;
  /** 道具类型 Key（透传自 entry） */
  readonly type: string;
  /** 编辑摆放基准：编辑器里移动道具时同步更新；stop() 复位以此为准 */
  entry: PropEntry;
  /** 物理刚体（基类构造时经 buildBody 创建） */
  readonly body: Matter.Body;
  /** 本道具拥有的全部刚体（默认含主 body；复合道具如绳索/篮筐会追加） */
  readonly bodies: Matter.Body[] = [];
  /** 本道具拥有的全部约束（绳索链/铰接销等） */
  readonly constraints: Matter.Constraint[] = [];
  /** 已从世界移除标记（绳烧断整绳移除/气球爆后跳过一切更新） */
  removed = false;
  /** 所属引擎引用（loadProps 时由引擎回填；编辑态为 undefined） */
  engine?: SimulationEngine;

  constructor(entry: PropEntry) {
    this.pid = entry.pid;
    this.type = entry.type;
    // 归一化可选字段：子类与引擎可放心按数值读取
    this.entry = { ...entry, angle: entry.angle ?? 0, scale: entry.scale ?? 1 };
    // 基类构造期创建刚体（见文件头注释：buildBody 内禁止读子类自有字段）
    this.body = this.buildBody();
    this.bodies.push(this.body);
  }

  /** 子类实现：创建物理刚体（形状/材质参数/静态性） */
  protected abstract buildBody(): Matter.Body;

  /** 子类声明：entry.isStatic 缺省时的静态默认值（如木板默认固定、球默认可动） */
  protected abstract get defaultStatic(): boolean;

  /** 最终静态性：显式配置优先，否则用类型默认值 */
  protected get isStaticFinal(): boolean {
    return this.entry.isStatic ?? this.defaultStatic;
  }

  /** 摆放角度（弧度）：Matter 内部以弧度运算，关卡数据以度存储 */
  protected get angleRad(): number {
    return ((this.entry.angle ?? 0) * Math.PI) / 180;
  }

  /** 最终缩放（缺省 1） */
  protected get scaleFinal(): number {
    return this.entry.scale ?? 1;
  }

  /**
   * 读取道具专属参数（entry.meta 的类型安全访问）
   * @param key 参数名
   * @param fallback 缺省值
   */
  protected metaValue<T>(key: string, fallback: T): T {
    const value = this.entry.meta?.[key];
    return (value === undefined || value === null ? fallback : value) as T;
  }

  // ---- 生命周期钩子（可选覆写） ----

  /** 运行开始钩子：RUNNING/FREE_RUN 起跑时调用一次（弹簧发射器点火等） */
  onRunStart?(): void;

  /** 固定步钩子：运行中每步调用（电机恒速/风扇施力/蜡烛点火检测等） */
  onFixedStep?(ctx: StepContext): void;

  /**
   * 碰撞进入钩子：与其他道具发生碰撞时调用
   * @param other 对方道具
   * @param relativeSpeed 相对速度幅值（px/步），用于力度阈值判断
   */
  onCollisionEnter?(other: PropBase, relativeSpeed: number): void;

  /**
   * 采集单个道具的运行时快照
   * @returns 快照数据（pid 冗余存储，保证快照可独立校验）
   */
  captureSnapshot(): PropSnapshot {
    const verlet = verletState(this.body);
    return {
      pid: this.pid,
      x: this.body.position.x,
      y: this.body.position.y,
      positionPrevX: verlet.positionPrev.x,
      positionPrevY: verlet.positionPrev.y,
      angle: this.body.angle,
      anglePrev: verlet.anglePrev,
      isStatic: this.body.isStatic,
      isSleeping: this.body.isSleeping,
    };
  }

  /**
   * 恢复到快照时刻的状态。
   * 顺序敏感：先复位静态性/位姿（ setPosition/setAngle 会平移 prev 保持速度），
   * 最后【直接覆写】prev 字段为快照值（权威隐式速度），再恢复休眠标记。
   * @param snap 此前由 captureSnapshot 产出的快照
   */
  restoreSnapshot(snap: PropSnapshot): void {
    Matter.Body.setStatic(this.body, snap.isStatic);
    Matter.Body.setPosition(this.body, { x: snap.x, y: snap.y });
    Matter.Body.setAngle(this.body, snap.angle);
    // 权威状态直接覆写：不走 setVelocity 换算（换算会引入漂移，见接口注释）
    const verlet = verletState(this.body);
    verlet.positionPrev.x = snap.positionPrevX;
    verlet.positionPrev.y = snap.positionPrevY;
    verlet.anglePrev = snap.anglePrev;
    Matter.Sleeping.set(this.body, snap.isSleeping);
  }

  /**
   * 复位到编辑摆放位：位置/角度回 entry，速度清零，强制唤醒。
   * 「⏹ 停止」回到编辑态时对全部道具调用——复位是精确的赋值而非重新加载。
   * 复合道具（绳索等）的附加段体由引擎统一重建世界，无需逐段复位。
   */
  resetToEntry(): void {
    Matter.Body.setPosition(this.body, { x: this.entry.x, y: this.entry.y });
    Matter.Body.setAngle(this.body, this.angleRad);
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(this.body, 0);
    Matter.Sleeping.set(this.body, false);
  }
}
