/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: DbService.ts
 * -----------------------------------------------------------------------------
 * 用途: 数据库 RPC 客户端（主线程侧）——把 Worker 内的 SQLite 封装成 Promise API
 *       - 小型 Promise RPC：自增 id + pending 表（约 40 行，不引入 Comlink 依赖）
 *       - 带 10s 超时保护：Worker 内异常挂起时调用方可感知失败
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { DbMode } from './types';

/** 请求超时（ms） */
const RPC_TIMEOUT_MS = 10_000;

/** 通用 SQL 执行器接口（DAO 依赖此抽象，便于单元测试替换实现） */
export interface SqlExecutor {
  exec(sql: string, bind?: unknown[]): Promise<void>;
  select<T>(sql: string, bind?: unknown[]): Promise<T[]>;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DbService implements SqlExecutor {
  /** 当前持久化模式（init 完成后有效） */
  mode: DbMode = 'memory';

  private readonly worker: Worker;
  private seq = 0;
  private readonly pending = new Map<number, PendingEntry>();

  constructor() {
    // Vite 原生 module worker：相对 URL 由构建期改写
    this.worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent) => this.onMessage(event.data);
    this.worker.onerror = (event) => {
      // Worker 级致命错误：拒绝所有挂起请求
      const err = new Error(`数据库 Worker 异常: ${event.message}`);
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(err);
      }
      this.pending.clear();
    };
  }

  /** 响应分发：按 id 找回 pending */
  private onMessage(data: { id: number; ok: boolean; result?: unknown; error?: string }): void {
    const entry = this.pending.get(data.id);
    if (!entry) return;
    this.pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error ?? '数据库操作失败'));
  }

  /** 发起一次 RPC 调用（带超时保护） */
  private call<T>(op: string, ...args: unknown[]): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`数据库操作超时: ${op}`));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.worker.postMessage({ id, op, args });
    });
  }

  /**
   * 初始化数据库（必须最先调用；等待 Worker 内 sqlite3 就绪）
   * @returns 持久化模式与诊断信息（mode=opfs 文件持久化；memory=需 IndexedDB 兜底）
   */
  async init(): Promise<DbMode> {
    const result = await this.call<{ mode: DbMode; detail?: string }>('init');
    this.mode = result.mode;
    this.initDetail = result.detail ?? '';
    return this.mode;
  }

  /** 初始化诊断信息（模式降级原因） */
  initDetail = '';

  exec(sql: string, bind?: unknown[]): Promise<void> {
    return this.call<void>('exec', sql, bind);
  }

  select<T>(sql: string, bind?: unknown[]): Promise<T[]> {
    return this.call<T[]>('select', sql, bind);
  }

  /** 整库导出字节流（IndexedDB 备份用） */
  exportBytes(): Promise<Uint8Array> {
    return this.call<Uint8Array>('export');
  }

  /** 从字节流恢复整库（IndexedDB 备份回灌用） */
  importBytes(bytes: Uint8Array): Promise<void> {
    return this.call<void>('import', bytes);
  }
}
