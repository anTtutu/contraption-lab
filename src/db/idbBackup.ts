/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: idbBackup.ts
 * -----------------------------------------------------------------------------
 * 用途: IndexedDB 兜底持久化（D16 三级降级链第二级）
 *       OPFS 不可用时（微信 iOS WKWebView 等老内核），把整库字节流定期快照到
 *       IndexedDB，启动时回灌——刷新/重启进度不丢。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */

/** IndexedDB 库名与对象仓 */
const IDB_NAME = 'contraption-lab-backup';
const STORE_NAME = 'sqlite';
const KEY = 'db-bytes';

/** 打开（创建）IndexedDB */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  });
}

/** 保存整库字节流 */
export async function idbSave(bytes: Uint8Array): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(bytes.slice(), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 写入失败'));
  });
  database.close();
}

/** 读取整库字节流（无备份返回 null） */
export async function idbLoad(): Promise<Uint8Array | null> {
  const database = await openDb();
  const bytes = await new Promise<Uint8Array | null>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 读取失败'));
  });
  database.close();
  return bytes;
}
