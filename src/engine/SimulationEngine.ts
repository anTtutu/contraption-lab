/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SimulationEngine.ts
 * -----------------------------------------------------------------------------
 * 用途: 模拟引擎主体（设计文档 §7.1 / §10.3 / §10.4）
 *       纯 TS、无渲染、无 Phaser 依赖 —— 可在 Vitest 中裸跑（物理回归测试的基础）。
 *       核心承诺：
 *       1) 确定性：固定 60Hz 步长 + 无随机 → 同关卡同摆放同倍速必得同轨迹；
 *       2) 解耦：内核只管 Matter world + 道具 + 状态机 + 事件流，
 *          渲染层每帧 step() 后读取刚体位姿同步 Sprite 即可；
 *       3) 快照：任意运行时刻可全量快照/恢复（编辑器精确复位、未来回放的基石）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import Matter from 'matter-js';
import { canTransition, EngineMode, GameState } from './GameState';
import { SimEmitter, SimEventMap } from './events';
import { COUNTDOWN_TOTAL_MS, FIXED_DT_MS, GRAVITY, OOB_TOP_MARGIN_FACTOR, TUNING } from './PhysicsTuning';
import { EngineSnapshot, PropBase, PropEntry } from './PropBase';
import { PROP_REGISTRY } from './propRegistry';
import type { GoalChecker } from './GoalChecker';
import type { StepContext } from './StepContext';

/** 模拟倍速档位（设计文档 §7.1：0.25 慢放 / 1 常速 / 2 加速） */
export type SimSpeed = 0.25 | 1 | 2;

/** 从刚体 plugin 读道具 pid（loadProps 时写入；无主刚体返回 undefined） */
function bodyPid(body: Matter.Body): string | undefined {
  return (body.plugin as { pid?: string } | undefined)?.pid;
}

/** 引擎构造选项（全部可缺省） */
export interface SimulationEngineOptions {
  /** 运行模式：level=闯关（有目标/超时/出界判失败），sandbox=沙盒自由实验。默认 level */
  mode?: EngineMode;
  /** 画布宽度（出界判定基准），默认 1280 */
  width?: number;
  /** 画布高度（出界判定基准），默认 720 */
  height?: number;
  /** 出界判定外扩边距（px），默认 120 */
  boundsMargin?: number;
  /** 关卡超时（虚拟运行毫秒），默认 60000（设计文档 §6.4） */
  timeoutMs?: number;
  /** 目标检测器（关卡模式用；沙盒忽略）。步骤 4 由关卡目标系统注入真实实现 */
  goalChecker?: GoalChecker;
}

/**
 * 模拟引擎：一个引擎实例 = 一局独立的物理世界
 * 生命周期：new → loadProps（编辑态）→ start（倒计时/沙盒直启）→ step 循环 → stop（复位）
 */
export class SimulationEngine {
  // ---- 不可变配置 ----
  /** 运行模式 */
  readonly mode: EngineMode;
  /** 类型化事件总线：状态迁移/出界/达成等全部经此对外广播 */
  readonly events = new SimEmitter<SimEventMap>();

  // ---- 内部状态 ----
  private readonly engine: Matter.Engine;
  private props: PropBase[] = [];
  private readonly propMap = new Map<string, PropBase>();
  private _state: GameState = 'EDITING';
  /** 全局步进计数（每次物理步进 +1，快照/回放的时间基准） */
  private _tick = 0;
  /** 虚拟运行时长（ms）：物理推进时间 × 倍速，超时判定依据 */
  private _virtualRunMs = 0;
  /** 倒计时剩余毫秒（COUNTDOWN 态递减） */
  private _countdownRemainingMs = 0;
  /** 当前倍速 */
  private _speed: SimSpeed = 1;
  /** 超时事件只发一次的防重标记 */
  private timeoutFired = false;
  /** 本轮 onRunStart 是否已派发（防止重复点火） */
  private runStartSent = false;
  /** 信号通道状态表（按压开关写，电机/磁铁读；stop 时清空） */
  readonly channels = new Map<string, boolean>();

  private readonly width: number;
  private readonly height: number;
  private readonly boundsMargin: number;
  private readonly timeoutMs: number;
  private readonly goalChecker?: GoalChecker;

  constructor(opts: SimulationEngineOptions = {}) {
    this.mode = opts.mode ?? 'level';
    this.width = opts.width ?? 1280;
    this.height = opts.height ?? 720;
    this.boundsMargin = opts.boundsMargin ?? 120;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.goalChecker = opts.goalChecker;

    // sleeping 关闭：本作刚体预算 ≤80（§10.3），休眠省不了多少性能，
    // 反而会让低速球在斜面上「睡着」不滚（L1-04 冰面 / L1-06 高道两次实锤），
    // 确定性也不受影响——利大于弊，直接禁用。
    this.engine = Matter.Engine.create({ enableSleeping: false });
    this.engine.gravity.x = GRAVITY.x;
    this.engine.gravity.y = GRAVITY.y;

    // 碰撞事件流：映射到道具 onCollisionEnter 钩子 + 广播 bodiesCollided
    // （开关压下/炸弹引爆/易碎物爆裂/铃铛响 都以此为基础）
    Matter.Events.on(this.engine, 'collisionStart', (evt) => this.handleCollisions(evt));
  }

  /**
   * Matter collisionStart → 道具钩子/引擎事件 的转换器
   * @param evt Matter 碰撞事件（含 pairs）
   */
  private handleCollisions(evt: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of evt.pairs) {
      const pidA = bodyPid(pair.bodyA);
      const pidB = bodyPid(pair.bodyB);
      if (!pidA || !pidB || pidA === pidB) continue;
      const propA = this.propMap.get(pidA);
      const propB = this.propMap.get(pidB);
      if (!propA || !propB) continue;
      // 相对速度幅值：用于「撞得多重」的阈值判断（炸弹引信/铃铛/气球靶）
      const speed = Matter.Vector.magnitude(
        Matter.Vector.sub(pair.bodyA.velocity, pair.bodyB.velocity),
      );
      propA.onCollisionEnter?.(propB, speed);
      propB.onCollisionEnter?.(propA, speed);
      this.events.emit('bodiesCollided', { aPid: pidA, bPid: pidB, speed });
    }
  }

  /**
   * 设置信号通道电平（按压开关调用；电机/磁铁等接收器在 onFixedStep 里读取）
   * @param channel 通道名（red/blue）
   * @param on 是否接通
   */
  setChannel(channel: string, on: boolean): void {
    this.channels.set(channel, on);
    this.events.emit('channelChanged', { channel, on });
  }

  /**
   * 爆炸原语：对半径内动态刚体施加径向速度增量（衰减线性，中心最大）
   * 礼花炸弹使用；速度增量法（而非力）保证与质量无关的「推得动」直觉。
   * @param x 爆心 x
   * @param y 爆心 y
   * @param radius 作用半径（px）
   * @param power 中心最大速度增量（px/步）
   */
  explode(x: number, y: number, radius: number, power: number): void {
    for (const prop of this.props) {
      if (prop.removed) continue;
      for (const body of prop.bodies) {
        if (body.isStatic) continue;
        const dx = body.position.x - x;
        const dy = body.position.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        // 距离线性衰减（0~1），方向径向外推
        const falloff = 1 - dist / radius;
        const inv = dist < 1 ? 0 : (power * falloff) / dist;
        Matter.Body.setVelocity(body, {
          x: body.velocity.x + dx * inv,
          y: body.velocity.y + dy * inv,
        });
        Matter.Sleeping.set(body, false);
      }
    }
    this.events.emit('explosion', { x, y });
  }

  /**
   * 从世界移除单个约束（绳索烧断点用；不产生事件）
   * @param constraint 已注册的约束引用
   */
  removeConstraint(constraint: Matter.Constraint): void {
    Matter.Composite.remove(this.engine.world, constraint);
  }

  /**
   * 整体移除一个道具（全部刚体+约束出世界，跳过后续更新）
   * @param pid 道具 ID
   */
  removeProp(pid: string): void {
    const prop = this.propMap.get(pid);
    if (!prop || prop.removed) return;
    for (const body of prop.bodies) {
      Matter.Composite.remove(this.engine.world, body);
    }
    for (const constraint of prop.constraints) {
      Matter.Composite.remove(this.engine.world, constraint);
    }
    prop.removed = true;
    this.props = this.props.filter((p) => p !== prop);
    this.propMap.delete(pid);
    this.events.emit('propRemoved', { pid });
  }

  /**
   * 后置注入目标检测器（关卡模式；解决「checker 需订阅引擎事件、
   * 引擎构造又需 checker」的循环依赖——先建引擎再注入）
   * @param checker 目标检测器
   */
  setGoalChecker(checker: GoalChecker): void {
    (this.goalChecker as GoalChecker | undefined) = checker;
  }

  // ---- 只读访问器（渲染层/测试用） ----
  get state(): GameState {
    return this._state;
  }

  get tick(): number {
    return this._tick;
  }

  get virtualRunMs(): number {
    return this._virtualRunMs;
  }

  get speed(): SimSpeed {
    return this._speed;
  }

  get countdownRemainingMs(): number {
    return this._countdownRemainingMs;
  }

  /** 世界内全部道具（只读视图） */
  getProps(): readonly PropBase[] {
    return this.props;
  }

  /** 按 pid 查道具（不存在返回 undefined） */
  getProp(pid: string): PropBase | undefined {
    return this.propMap.get(pid);
  }

  // ---- 世界构建（编辑态） ----

  /**
   * 载入关卡道具（整表替换）。仅 EDITING 态可调用——运行中换世界是未定义行为。
   * @param entries 关卡道具条目数组
   * @throws 非编辑态调用、或存在未注册的道具类型时抛错（fail fast）
   */
  loadProps(entries: PropEntry[]): void {
    this.assertState('EDITING', 'loadProps');
    this.loadPropsInternal(entries);
  }

  /**
   * 世界构建内部实现（不校验状态）。
   * @param entries 关卡道具条目数组
   */
  private loadPropsInternal(entries: PropEntry[]): void {
    // 清空旧世界（keepStatic=false：连静态体一起清，保证整表替换语义）
    Matter.Composite.clear(this.engine.world, false);
    this.props = [];
    this.propMap.clear();
    this.channels.clear();
    this.runStartSent = false;

    for (const entry of entries) {
      const registration = PROP_REGISTRY[entry.type];
      if (!registration) {
        throw new Error(`未注册的道具类型: "${entry.type}"（pid=${entry.pid}），请检查 propRegistry`);
      }
      const prop = registration.create(entry);
      prop.engine = this;
      // 全部刚体登记 pid（碰撞事件回查道具用）；全部刚体/约束入世界
      for (const body of prop.bodies) {
        (body.plugin as { pid?: string }) = { pid: entry.pid };
        Matter.Composite.add(this.engine.world, body);
      }
      for (const constraint of prop.constraints) {
        Matter.Composite.add(this.engine.world, constraint);
      }
      this.props.push(prop);
      this.propMap.set(entry.pid, prop);
      this.events.emit('propAdded', { pid: entry.pid });
    }
  }

  /**
   * 编辑态移动/旋转道具：同步更新「摆放基准 entry」与物理体——
   * 之后 stop() 复位就会停在新位置，与编辑器的所见即所得一致。
   * @param pid 道具 ID
   * @param x 新中心 x
   * @param y 新中心 y
   * @param angleDeg 新角度（度），缺省保持原角度
   */
  moveProp(pid: string, x: number, y: number, angleDeg?: number): void {
    this.assertState('EDITING', 'moveProp');
    const prop = this.requireProp(pid);
    prop.entry = { ...prop.entry, x, y, angle: angleDeg ?? prop.entry.angle };
    Matter.Body.setPosition(prop.body, { x, y });
    Matter.Body.setAngle(prop.body, ((prop.entry.angle ?? 0) * Math.PI) / 180);
    Matter.Sleeping.set(prop.body, false);
  }

  // ---- 状态控制 ----

  /**
   * 启动模拟：关卡模式进入 3-2-1 倒计时；沙盒模式直接自由运行。
   * 非编辑态调用为无效操作（防 UI 按钮连点），不抛错。
   */
  start(): void {
    if (this._state !== 'EDITING') return;
    if (this.mode === 'sandbox') {
      this.transition('FREE_RUN');
      this.events.emit('runStarted', { mode: this.mode });
    } else {
      this._countdownRemainingMs = COUNTDOWN_TOTAL_MS;
      this.transition('COUNTDOWN');
    }
  }

  /**
   * 停止并复位：全部道具精确回到编辑摆放位（速度清零、强制唤醒），
   * 计数器清零，状态回 EDITING。编辑态调用为无效操作。
   */
  stop(): void {
    if (this._state === 'EDITING') return;
    this.resetRuntime();
    this.transition('EDITING');
  }

  /**
   * 设置模拟倍速（设计文档 §7.1 三档）
   * @param speed 0.25 / 1 / 2
   */
  setSpeed(speed: SimSpeed): void {
    this._speed = speed;
  }

  // ---- 快照 ----

  /**
   * 采集全量快照（当前状态 + 计数器 + 全部道具位姿速度）
   * @returns 可持久化的引擎快照
   */
  captureSnapshot(): EngineSnapshot {
    return {
      tick: this._tick,
      virtualRunMs: this._virtualRunMs,
      state: this._state,
      props: this.props.map((p) => p.captureSnapshot()),
    };
  }

  /**
   * 恢复全量快照。
   *
   * 实现：采用「重建世界 + 覆写位姿/隐式速度」——清空重载可消灭刚体上
   * 接触求解器的残留瞬时状态，新刚体隐藏状态全部归零。
   *
   * 语义（重要）：本方法是【确定性重放】——同一快照恢复到任意引擎，
   * 续跑结果逐位一致；但与「未中断的连续运行」之间存在混沌放大的微小偏差
   * （根因：engine.pairs 接触暖启动冲量跨步持久且不可序列化，实测 160 步
   * 漂移 < 15px，视觉回放无感）。不要将其用于逐位审计；编辑位复位
   * （stop → resetToEntry）不受影响，仍为逐位精确。
   *
   * @param snap 此前 captureSnapshot 的产物
   */
  restoreSnapshot(snap: EngineSnapshot): void {
    // 1) 以当前摆放基准重建世界（清掉一切隐藏求解器状态）
    const entries = this.props.map((p) => ({ ...p.entry }));
    this.loadPropsInternal(entries);
    // 2) 套用快照时刻的位姿/速度/静态/休眠
    for (const ps of snap.props) {
      this.propMap.get(ps.pid)?.restoreSnapshot(ps);
    }
    // 3) 还原计数器与状态标记
    this._tick = snap.tick;
    this._virtualRunMs = snap.virtualRunMs;
    this._state = snap.state;
  }

  // ---- 每帧驱动 ----

  /**
   * 推进一个逻辑步。由渲染循环（或测试）以帧频调用；
   * 内部恒定以 FIXED_DT_MS 步进物理——真实帧率波动不影响模拟轨迹。
   *
   * 分状态行为：
   * - COUNTDOWN：递减倒计时（不受倍速影响，3-2-1 节奏恒定），归零自动转 RUNNING；
   * - RUNNING / FREE_RUN：物理步进 + 目标/超时/出界检测；
   * - 其余状态（EDITING/SUCCESS/FAILED）：直接返回（物理静止）。
   */
  step(): void {
    const s = this._state;

    // ---- 倒计时阶段 ----
    if (s === 'COUNTDOWN') {
      const before = Math.ceil(this._countdownRemainingMs / 1000);
      this._countdownRemainingMs -= FIXED_DT_MS;
      const after = Math.ceil(Math.max(0, this._countdownRemainingMs) / 1000);
      // 整数秒跳变时广播（供 UI 数字与音效 tick）
      if (after !== before) {
        this.events.emit('countdownTick', { remainingSeconds: after });
      }
      this._tick++;
      if (this._countdownRemainingMs <= 0) {
        this.transition('RUNNING');
        this.events.emit('runStarted', { mode: this.mode });
      }
      return;
    }

    // ---- 静止状态直接返回 ----
    if (s !== 'RUNNING' && s !== 'FREE_RUN') {
      return;
    }

    // ---- 物理步进（delta 恒定 ⇒ 确定性；倍速经 timeScale 缩放有效时长）----
    this.engine.timing.timeScale = this._speed;
    Matter.Engine.update(this.engine, FIXED_DT_MS);
    this._tick++;
    this._virtualRunMs += FIXED_DT_MS * this._speed;

    // ---- 起跑钩子（首轮步进时派发一次：弹簧发射器点火等）----
    if (!this.runStartSent) {
      this.runStartSent = true;
      for (const prop of this.props) {
        if (!prop.removed) prop.onRunStart?.();
      }
    }

    // ---- 道具固定步钩子（电机恒速/齿轮联动/风扇施力/蜡烛点火检测等）----
    const ctx: StepContext = { engine: this, channels: this.channels };
    for (const prop of this.props) {
      if (!prop.removed && prop.onFixedStep) {
        prop.onFixedStep(ctx);
      }
    }

    // ---- 目标检测（仅关卡运行态）----
    if (s === 'RUNNING' && this.goalChecker) {
      const achieved = this.goalChecker.check({
        tick: this._tick,
        virtualRunMs: this._virtualRunMs,
        props: this.props,
      });
      if (achieved > 0) {
        this.transition('SUCCESS');
        this.events.emit('goalAchieved', { achievedCount: achieved });
        return;
      }
    }

    // ---- 超时检测（仅关卡运行态，事件只发一次）----
    if (s === 'RUNNING' && !this.timeoutFired && this._virtualRunMs >= this.timeoutMs) {
      this.timeoutFired = true;
      this.events.emit('runTimeout', { virtualRunMs: this._virtualRunMs });
      this.transition('FAILED');
      return;
    }

    // ---- 出界检测：关卡态判 FAILED；沙盒态仅播报不终结（设计文档 §10.4）----
    for (const prop of this.props) {
      if (prop.body.isStatic) continue;
      const { x, y } = prop.body.position;
      // 下方/左右按 1 倍边距；上方放宽到 3 倍（弹簧弹射类道具腾空更高）
      const out =
        y > this.height + this.boundsMargin ||
        y < -this.boundsMargin * OOB_TOP_MARGIN_FACTOR ||
        x < -this.boundsMargin ||
        x > this.width + this.boundsMargin;
      if (out) {
        this.events.emit('propOutOfBounds', { pid: prop.pid, x, y });
        if (s === 'RUNNING') {
          this.transition('FAILED');
        }
        return; // 一次 step 最多播报一个出界道具，其余下帧再报
      }
    }
  }

  // ---- 私有工具 ----

  /** 运行时数据复位：道具回编辑位、计数器清零、信号通道断电（stop 与状态复位共用） */
  private resetRuntime(): void {
    for (const prop of this.props) {
      prop.resetToEntry();
    }
    this._virtualRunMs = 0;
    this._countdownRemainingMs = 0;
    this.timeoutFired = false;
    this.channels.clear();
    this.runStartSent = false;
  }

  /**
   * 状态迁移（带合法性校验 + 事件广播）
   * @throws 迁移表之外的迁移视为程序错误，直接抛异常
   */
  private transition(to: GameState): void {
    if (!canTransition(this._state, to)) {
      throw new Error(`非法状态迁移: ${this._state} → ${to}`);
    }
    const from = this._state;
    this._state = to;
    this.events.emit('stateChanged', { from, to });
  }

  /** 断言当前处于指定状态，否则抛错（写操作的前置保护） */
  private assertState(expected: GameState, action: string): void {
    if (this._state !== expected) {
      throw new Error(`${action} 仅允许在 ${expected} 态调用，当前为 ${this._state}`);
    }
  }

  /** 按 pid 取道具，缺失即抛错（内部调用保证 pid 一定存在） */
  private requireProp(pid: string): PropBase {
    const prop = this.propMap.get(pid);
    if (!prop) {
      throw new Error(`道具不存在: pid=${pid}`);
    }
    return prop;
  }

  // 引擎原始物理世界（高级用途/调试暴露；常规读写走上面的封装）
  get matterEngine(): Matter.Engine {
    return this.engine;
  }

  /** 供调参/调试查看的调参表引用 */
  static readonly TUNING = TUNING;
}
