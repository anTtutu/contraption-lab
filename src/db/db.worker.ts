/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: db.worker.ts
 * -----------------------------------------------------------------------------
 * 用途: SQLite 数据库 Worker（设计文档 §11.1）
 *       - @sqlite.org/sqlite-wasm 官方 WASM，全部数据库操作在本 Worker 内执行
 *         （OPFS 同步句柄要求专用 Worker，且避免阻塞渲染主线程）
 *       - 持久化优先级（D16 三级降级链）：OPFS 文件 → 内存库（配 IndexedDB 备份）→ 纯内存
 *       - 协议：主线程发 {id, op, args}，本 Worker 回 {id, ok, result|error}
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

/** 数据库文件在 OPFS 中的路径 */
const DB_PATH = '/contraption-lab.db';

/** 请求协议 */
interface RpcRequest {
  id: number;
  op: 'init' | 'exec' | 'select' | 'export' | 'import';
  args: unknown[];
}

/** sqlite3 模块与库实例的宽松类型（包内类型对 worker 场景过度严格，收敛于此文件） */
interface SqliteDb {
  exec(options: { sql: string; bind?: unknown[]; rowMode?: string; callback?: (row: unknown) => void }): unknown;
  close(): void;
}

/** wasm 堆工具（deserialize 导入需要手动分配） */
interface SqliteWasm {
  allocFromTypedArray(bytes: Uint8Array): number;
}

/** sqlite3 顶层模块形态 */
interface Sqlite3Module {
  oo1: { DB: new (name: string, flags?: string) => SqliteDb };
  wasm: SqliteWasm;
  capi: {
    sqlite3_js_db_export(db: SqliteDb): Uint8Array;
    sqlite3_deserialize(db: SqliteDb, schema: string, ptr: number, szDb: number, szBuf: number, flags: number): number;
    SQLITE_OK: number;
    SQLITE_DESERIALIZE_FREEONCLOSE?: number;
    SQLITE_DESERIALIZE_RESIZEABLE?: number;
  };
  installOpfsSAHPoolVfs?: (options?: Record<string, unknown>) => Promise<unknown>;
}

let db: SqliteDb | null = null;
let sqlite3: Sqlite3Module | null = null;

/** 当前持久化模式：opfs = 文件级持久化；memory = 内存（由外层 IndexedDB 兜底） */
let mode: 'opfs' | 'memory' = 'memory';

self.onmessage = async (event: MessageEvent<RpcRequest>): Promise<void> => {
  const { id, op, args } = event.data;
  try {
    const result = await handle(op, args);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

async function handle(op: string, args: unknown[]): Promise<unknown> {
  switch (op) {
    case 'init':
      return initDb();
    case 'exec':
      execSql(args[0] as string, args[1] as unknown[] | undefined);
      return null;
    case 'select':
      return selectAll(args[0] as string, args[1] as unknown[] | undefined);
    case 'export':
      return exportDb();
    case 'import':
      await importDb(args[0] as Uint8Array);
      return null;
    default:
      throw new Error(`未知数据库操作: ${op}`);
  }
}

/** 初始化：优先 opfs-sahpool VFS（无需 COOP/COEP 头，静态部署友好），否则内存库 */
/**
 * 是否尝试 opfs-sahpool VFS。
 * ⚠️ 2026-10-18 实测：sahpool mount 时排他锁全部池资源，页面刷新强杀 Worker 后
 * 锁释放存在竞态，下一次挂载判定池损坏并重建 → 跨会话丢档（上游已知约束）。
 * 故默认关闭，主持久化走「内存库 + IndexedDB 整库快照」（bootstrap 挂钩），
 * 数据仍 100% 存于 SQLite 结构。上游修复后可改回 true。
 */
const USE_SAHPOOL = false;

async function initDb(): Promise<{ mode: 'opfs' | 'memory'; detail: string }> {
  sqlite3 = (await sqlite3InitModule()) as unknown as Sqlite3Module;

  if (USE_SAHPOOL && typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      await sqlite3.installOpfsSAHPoolVfs();
      db = new sqlite3.oo1.DB(`${DB_PATH}?vfs=opfs-sahpool`, 'c');
      mode = 'opfs';
      return { mode, detail: 'opfs-sahpool 就绪（实验性）' };
    } catch (err) {
      console.warn('[db.worker] opfs-sahpool 初始化失败，降级内存库:', err);
    }
  }
  db = new sqlite3.oo1.DB(':memory:', 'c');
  mode = 'memory';
  return { mode, detail: '内存库 + IndexedDB 快照（跨会话持久）' };
}

/** 执行写语句 */
function execSql(sql: string, bind?: unknown[]): void {
  assertDb().exec({ sql, bind: bind as never });
}

/** 查询并以对象数组返回 */
function selectAll<T>(sql: string, bind?: unknown[]): T[] {
  const rows: T[] = [];
  assertDb().exec({
    sql,
    bind: bind as never,
    rowMode: 'object',
    callback: (row) => rows.push(row as T),
  });
  return rows;
}

/** 整库序列化（IndexedDB 备份用） */
function exportDb(): Uint8Array {
  return sqlite3!.capi.sqlite3_js_db_export(assertDb());
}

/** 反序列化恢复整库（IndexedDB 备份回灌用）——官方配方：手动入 wasm 堆 + 交还所有权 */
async function importDb(bytes: Uint8Array): Promise<void> {
  const mod = sqlite3;
  if (!mod) throw new Error('数据库尚未初始化');
  assertDb().close();
  db = new mod.oo1.DB(':memory:', 'c');
  // postMessage 结构化克隆可能产生跨 realm 的类数组，统一规整为 Uint8Array
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  // 低级绑定第三参是裸指针：先复制进 wasm 堆，再以 FREEONCLOSE 交还所有权（防泄漏）
  const ptr = mod.wasm.allocFromTypedArray(data);
  const flagFree = mod.capi.SQLITE_DESERIALIZE_FREEONCLOSE ?? 1;
  const flagResize = mod.capi.SQLITE_DESERIALIZE_RESIZEABLE ?? 2;
  const rc = mod.capi.sqlite3_deserialize(
    db,
    'main',
    ptr,
    data.length,
    data.length,
    flagFree | flagResize,
  );
  if (rc !== mod.capi.SQLITE_OK) {
    throw new Error(`sqlite3_deserialize 失败，返回码 ${rc}`);
  }
}

function assertDb(): SqliteDb {
  if (!db) throw new Error('数据库尚未初始化（init 未完成）');
  return db;
}

// Worker 环境空导出：防止被当成纯模块 tree-shake 掉副作用
export {};
