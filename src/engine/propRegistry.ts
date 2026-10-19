/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: propRegistry.ts
 * -----------------------------------------------------------------------------
 * 用途: 道具注册表 —— 道具类型的唯一登记处（设计文档 §5 全量 30 类 38 种）
 *       引擎按 entry.type 在此查表创建运行时实例；渲染层按 viewOf 拿贴图与
 *       显示尺寸。新增道具：①写道具类 ②TextureFactory 加绘制 ③在此登记。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { TEX_KEYS } from '../core/TextureFactory';
import { PropBase, PropEntry } from './PropBase';
import { BALL_RADII } from './PhysicsTuning';
import { BallProp, BallVariant, ballVariantOf } from './props/BallProp';
import { PlankProp } from './props/PlankProp';
import { ShelfProp } from './props/ShelfProp';
import {
  BouncyPadProp, CurvedTrackProp, IceBlockProp, PillarProp, TrampolineProp, WedgeProp,
  BOUNCY_PAD_HEIGHT, BOUNCY_PAD_WIDTH, CURVED_TRACK_RADIUS, ICE_HEIGHT, ICE_WIDTH,
  PILLAR_HEIGHT, PILLAR_WIDTH, TRAMPOLINE_HEIGHT, TRAMPOLINE_WIDTH, WEDGE_HEIGHT, WEDGE_WIDTH,
} from './props/StaticProps';
import { SEESAW_LENGTH, SEESAW_THICKNESS, SeesawProp } from './props/SeesawProp';
import { GEAR_RADII, RotatingDiscProp } from './props/RotatingDiscProp';
import { RACK_HEIGHT, RACK_WIDTH, RackProp } from './props/RackProp';
import { CONVEYOR_HEIGHT, CONVEYOR_WIDTH, ConveyorProp } from './props/ConveyorProp';
import { FAN_SIZE, FanProp } from './props/FanProp';
import { MAGNET_HEIGHT, MAGNET_WIDTH, MagnetProp } from './props/MagnetProp';
import { ROPE_LINK_LENGTH, ROPE_LINK_WIDTH, RopeProp } from './props/RopeProp';
import { CANDLE_HEIGHT, CANDLE_WIDTH, CandleProp } from './props/CandleProp';
import { LAUNCHER_HEIGHT, LAUNCHER_WIDTH, SpringLauncherProp } from './props/SpringLauncherProp';
import { BOMB_RADIUS, BombProp, ROCKET_HEIGHT, ROCKET_WIDTH, RocketProp } from './props/ExplosiveProps';
import { PressSwitchProp, RECEIVER_HEIGHT, RECEIVER_WIDTH, ReceiverProp, SWITCH_HEIGHT, SWITCH_WIDTH } from './props/SwitchProps';
import { BALLOON_RADIUS, BalloonProp, HAMSTER_RADIUS, HamsterProp } from './props/FloatProps';
import {
  BALLOON_TARGET_RADIUS, BasketProp, BELL_HEIGHT, BELL_WIDTH, BalloonTargetProp, BellProp,
} from './props/GoalProps';

/** 道具的渲染视图元数据：贴图 Key + 贴图像素尺寸（物理体尺寸可能不含描边留白） */
export interface PropViewMeta {
  texture: string;
  width: number;
  height: number;
}

/** 单个道具类型的注册项：运行时创建 + 渲染视图两部分 */
export interface PropRegistration {
  /** 由关卡条目创建运行时实例 */
  create(entry: PropEntry): PropBase;
  /** 由关卡条目推导渲染视图（变体可能影响贴图，如五种球） */
  viewOf(entry: PropEntry): PropViewMeta;
}

/** 贴图四周描边留白（TextureFactory 统一 4px） */
const PAD = 8;

/** 球变体 → 贴图 Key 映射 */
const BALL_TEXTURES: Record<BallVariant, string> = {
  wood: TEX_KEYS.BALL_WOOD,
  steel: TEX_KEYS.BALL_STEEL,
  bouncy: TEX_KEYS.BALL_BOUNCY,
  pingpong: TEX_KEYS.BALL_PINGPONG,
  bowling: TEX_KEYS.BALL_BOWLING,
};

/** 辅助：固定贴图视图 */
function view(texture: string, w: number, h: number): PropViewMeta {
  return { texture, width: w, height: h };
}

/**
 * 道具注册表：type Key → 注册项
 * ⚠️ 关卡 JSON 里的 type 字段必须能在此查到，否则加载期直接报错（fail fast）
 */
export const PROP_REGISTRY: Record<string, PropRegistration> = {
  // ---- 运动体（§5.1） ----
  ball: {
    create: (e) => new BallProp(e),
    viewOf: (e) => {
      const variant = ballVariantOf(e.variant);
      const r = BALL_RADII[variant] ?? 26;
      return view(BALL_TEXTURES[variant], r * 2 + PAD, r * 2 + PAD);
    },
  },
  balloon: {
    create: (e) => new BalloonProp(e),
    viewOf: () => view(TEX_KEYS.BALLOON, BALLOON_RADIUS * 2 + PAD + 4, BALLOON_RADIUS * 2 + PAD + 24),
  },
  hamster: {
    create: (e) => new HamsterProp(e),
    viewOf: () => view(TEX_KEYS.HAMSTER, HAMSTER_RADIUS * 2 + PAD, HAMSTER_RADIUS * 2 + PAD),
  },

  // ---- 结构与引导（§5.2） ----
  plank: {
    create: (e) => new PlankProp(e),
    viewOf: () => view(TEX_KEYS.PLANK, 248, 28),
  },
  shelf: {
    create: (e) => new ShelfProp(e),
    viewOf: () => view(TEX_KEYS.SHELF, 208, 48),
  },
  pillar: {
    create: (e) => new PillarProp(e),
    viewOf: () => view(TEX_KEYS.PILLAR, PILLAR_WIDTH + PAD, PILLAR_HEIGHT + PAD),
  },
  wedge: {
    create: (e) => new WedgeProp(e),
    viewOf: () => view(TEX_KEYS.WEDGE, WEDGE_WIDTH + PAD, WEDGE_HEIGHT + PAD),
  },
  iceBlock: {
    create: (e) => new IceBlockProp(e),
    viewOf: () => view(TEX_KEYS.ICE_BLOCK, ICE_WIDTH + PAD, ICE_HEIGHT + PAD),
  },
  bouncyPad: {
    create: (e) => new BouncyPadProp(e),
    viewOf: () => view(TEX_KEYS.BOUNCY_PAD, BOUNCY_PAD_WIDTH + PAD, BOUNCY_PAD_HEIGHT + PAD),
  },
  trampoline: {
    create: (e) => new TrampolineProp(e),
    viewOf: () => view(TEX_KEYS.TRAMPOLINE, TRAMPOLINE_WIDTH + PAD, TRAMPOLINE_HEIGHT + PAD + 28),
  },
  curvedTrack: {
    create: (e) => new CurvedTrackProp(e),
    viewOf: () => view(TEX_KEYS.CURVED_TRACK, CURVED_TRACK_RADIUS + 60, CURVED_TRACK_RADIUS + 60),
  },
  seesaw: {
    create: (e) => new SeesawProp(e),
    viewOf: () => view(TEX_KEYS.SEESAW, SEESAW_LENGTH + PAD, SEESAW_THICKNESS + PAD + 26),
  },

  // ---- 传动机构（§5.3） ----
  motor: {
    create: (e) => new RotatingDiscProp(e),
    viewOf: () => view(TEX_KEYS.MOTOR, 116, 116),
  },
  gear: {
    create: (e) => new RotatingDiscProp(e),
    viewOf: (e) => {
      const size = (e.meta?.size as keyof typeof GEAR_RADII) ?? 'middle';
      const r = GEAR_RADII[size] ?? GEAR_RADII.middle;
      return view(TEX_KEYS[`GEAR_${size.toUpperCase() as 'LARGE' | 'MIDDLE' | 'SMALL'}`] ?? TEX_KEYS.GEAR_MIDDLE, r * 2 + 28, r * 2 + 28);
    },
  },
  pulley: {
    create: (e) => new RotatingDiscProp(e),
    viewOf: () => view(TEX_KEYS.PULLEY, 106, 106),
  },
  cam: {
    create: (e) => new RotatingDiscProp(e),
    viewOf: () => view(TEX_KEYS.CAM, 116, 116),
  },
  turntable: {
    create: (e) => new RotatingDiscProp(e),
    viewOf: () => view(TEX_KEYS.TURNTABLE, 236, 236),
  },
  rack: {
    create: (e) => new RackProp(e),
    viewOf: () => view(TEX_KEYS.RACK, RACK_WIDTH + PAD, RACK_HEIGHT + PAD),
  },
  conveyor: {
    create: (e) => new ConveyorProp(e),
    viewOf: () => view(TEX_KEYS.CONVEYOR, CONVEYOR_WIDTH + PAD, CONVEYOR_HEIGHT + PAD),
  },

  // ---- 绳索与吊挂（§5.4；rope 可燃 / chain 不可燃） ----
  rope: {
    create: (e) => new RopeProp(e),
    viewOf: () => view(TEX_KEYS.ROPE_LINK, ROPE_LINK_WIDTH + 12, ROPE_LINK_LENGTH + 12),
  },
  chain: {
    create: (e) => new RopeProp({ ...e, meta: { ...e.meta, burnable: false } }),
    viewOf: () => view(TEX_KEYS.ROPE_LINK, ROPE_LINK_WIDTH + 12, ROPE_LINK_LENGTH + 12),
  },
  pulleyCompound: {
    // 动滑轮组：途经点路径绳（编辑器给 3 个 waypoint），复用绳索物理
    create: (e) => new RopeProp({ ...e, meta: { ...e.meta, burnable: false } }),
    viewOf: () => view(TEX_KEYS.PULLEY, 106, 106),
  },

  // ---- 能源与触发（§5.5） ----
  candle: {
    create: (e) => new CandleProp(e),
    viewOf: () => view(TEX_KEYS.CANDLE, CANDLE_WIDTH + PAD, CANDLE_HEIGHT + PAD + 14),
  },
  springLauncher: {
    create: (e) => new SpringLauncherProp(e),
    viewOf: () => view(TEX_KEYS.SPRING_LAUNCHER, LAUNCHER_WIDTH + PAD, LAUNCHER_HEIGHT + PAD),
  },
  bomb: {
    create: (e) => new BombProp(e),
    viewOf: () => view(TEX_KEYS.BOMB, BOMB_RADIUS * 2 + PAD + 10, BOMB_RADIUS * 2 + PAD + 10),
  },
  rocket: {
    create: (e) => new RocketProp(e),
    viewOf: () => view(TEX_KEYS.ROCKET, ROCKET_WIDTH + PAD + 4, ROCKET_HEIGHT + PAD),
  },
  pressSwitch: {
    create: (e) => new PressSwitchProp(e),
    viewOf: () => view(TEX_KEYS.PRESS_SWITCH, SWITCH_WIDTH + PAD, SWITCH_HEIGHT + PAD + 14),
  },
  receiver: {
    create: (e) => new ReceiverProp(e),
    viewOf: () => view(TEX_KEYS.RECEIVER, RECEIVER_WIDTH + PAD, RECEIVER_HEIGHT + PAD),
  },

  // ---- 特殊道具（§5.6） ----
  fan: {
    create: (e) => new FanProp(e),
    viewOf: () => view(TEX_KEYS.FAN, FAN_SIZE + PAD, FAN_SIZE + PAD),
  },
  magnet: {
    create: (e) => new MagnetProp(e),
    viewOf: () => view(TEX_KEYS.MAGNET, MAGNET_WIDTH + PAD, MAGNET_HEIGHT + PAD),
  },

  // ---- 目标物（§5.7） ----
  basket: {
    create: (e) => new BasketProp(e),
    viewOf: () => view(TEX_KEYS.BASKET, 166, 144),
  },
  feedBowl: {
    create: (e) => new BasketProp(e),
    viewOf: () => view(TEX_KEYS.FEED_BOWL, 128, 96),
  },
  balloonTarget: {
    create: (e) => new BalloonTargetProp(e),
    viewOf: () => view(TEX_KEYS.BALLOON_TARGET, BALLOON_TARGET_RADIUS * 2 + PAD + 4, BALLOON_TARGET_RADIUS * 2 + PAD + 18),
  },
  bell: {
    create: (e) => new BellProp(e),
    viewOf: () => view(TEX_KEYS.BELL, BELL_WIDTH + PAD, BELL_HEIGHT + PAD),
  },
};

/** 全部已注册道具类型 Key（校验器/编辑器道具库遍历用） */
export const REGISTERED_TYPES: readonly string[] = Object.keys(PROP_REGISTRY);
