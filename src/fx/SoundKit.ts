/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: SoundKit.ts
 * -----------------------------------------------------------------------------
 * 用途: WebAudio 程序化音效合成器（设计文档 §4.4/D12：零素材，全部代码合成）
 *       - 单例：全游戏共享一个 AudioContext（浏览器自动播放策略要求
 *         「首次用户手势后才能出声」→ unlock() 在首次 pointerdown 调用）
 *       - 音色：振荡器 + 噪声缓冲 + 包络，无任何音频文件
 *       - 静音开关：settings 持久化（主线程 setMuted / isMuted）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** 包络参数（纯数据，便于单测） */
export interface Envelope {
  /** 起始音量 0-1 */
  peak: number;
  /** 衰减到 0 的时长（秒） */
  decay: number;
}

/**
 * 计算指数衰减包络采样（纯函数，可单测）
 * @param env 包络参数
 * @param sampleRate 采样率
 * @returns 归一化采样数组（长度 = decay * sampleRate）
 */
export function buildEnvelope(env: Envelope, sampleRate = 44100): Float32Array {
  const length = Math.max(1, Math.floor(env.decay * sampleRate));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // 指数衰减：起步 peak，末尾趋近 0
    out[i] = env.peak * Math.exp(-4 * (i / length));
  }
  return out;
}

/** 撞击力度 → 音量（速度 4-20 映射 0.08-0.5，纯函数可单测） */
export function impactVolume(speed: number): number {
  const clamped = Math.max(4, Math.min(20, speed));
  return 0.08 + ((clamped - 4) / 16) * 0.42;
}

/** 撞击音效节流（纯逻辑：距上次播放不足 minGapMs 则跳过） */
export class ThrottleGate {
  private lastAt = -Infinity;
  constructor(private readonly minGapMs: number) {}

  /** 是否允许通过（内部推进时间戳） */
  allow(nowMs: number): boolean {
    if (nowMs - this.lastAt < this.minGapMs) return false;
    this.lastAt = nowMs;
    return true;
  }
}

/** 程序化音效合成器（浏览器单例） */
export class SoundKit {
  private static instance: SoundKit | null = null;
  static get(): SoundKit {
    if (!SoundKit.instance) SoundKit.instance = new SoundKit();
    return SoundKit.instance;
  }

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private impactGate = new ThrottleGate(90);

  private constructor() {}

  /** 静音状态（设置页/静音按钮切换） */
  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * 解锁音频（必须在首次用户手势里调用；重复调用无害）
   * D16 移动兼容基线④：iOS/微信要求触摸后才能出声
   */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 主入口：确认可用则执行合成回调 */
  private play(fn: (ctx: AudioContext, out: GainNode) => void): void {
    if (!this.ctx || !this.master || this._muted) return;
    if (this.ctx.state !== 'running') return;
    fn(this.ctx, this.master);
  }

  /** 碰撞声：带通噪声脉冲（力度映射音量，节流防刷屏） */
  impact(speed: number, nowMs: number): void {
    if (!this.impactGate.allow(nowMs)) return;
    const vol = impactVolume(speed);
    this.play((ctx, out) => {
      const dur = 0.06;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-8 * (i / data.length));
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700 + Math.random() * 500;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(out);
      src.start();
    });
  }

  /** 爆炸：低频正弦扫频 + 噪声尾 */
  explosion(): void {
    this.play((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** 气球爆裂：短促高频 pop */
  pop(): void {
    this.play((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  /** 倒计时哔 */
  tick(high = false): void {
    this.play((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = high ? 880 : 660;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  /** 成功：上行三连琶音（C-E-G） */
  success(): void {
    this.play((ctx, out) => {
      const t0 = ctx.currentTime;
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = t0 + i * 0.12;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    });
  }

  /** 失败：下行两音（温和，不吓人） */
  fail(): void {
    this.play((ctx, out) => {
      const t0 = ctx.currentTime;
      [392, 330].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = t0 + i * 0.15;
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    });
  }

  /** 按钮咔哒 */
  click(): void {
    this.play((ctx, out) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.05);
    });
  }

  /** 保存叮咚 */
  chime(): void {
    this.play((ctx, out) => {
      const t0 = ctx.currentTime;
      [880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = t0 + i * 0.1;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    });
  }
}
