/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: bootstrap.ts
 * -----------------------------------------------------------------------------
 * 用途: 数据库引导装配 —— DbService(Worker) → 备份回灌 → 建表 → 种子导入
 *       → 挂「每次写立即整库快照到 IndexedDB」钩子（D16 三级降级链的编排处）
 *       ⚠️ 不用防抖：写频率为「通关/保存」级（极低），整库 export ≈100KB 开销可忽略；
 *       防抖窗口期刷新会丢最后一次写（2026-10-18 实测丢档根因）。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { DbService } from './DbService';
import { GameRepository } from './repository';
import { idbLoad, idbSave } from './idbBackup';

/**
 * 引导数据库并返回仓库实例（调用方随后自行 loadProgressMap 并组装 ProgressSnapshot）
 * @param service 已创建的 DbService
 */
export async function bootstrapDatabase(service: DbService): Promise<GameRepository> {
  await service.init();
  const repo = new GameRepository(service);

  // 回灌 IndexedDB 快照（若有）——主持久化路径：内存 SQLite + 整库快照
  try {
    const bytes = await idbLoad();
    if (bytes) {
      await service.importBytes(bytes);
    }
  } catch (err) {
    console.warn('[db] IndexedDB 备份回灌失败（按全新库继续）:', err);
  }

  await repo.createTables();
  await repo.seedOfficial();

  // 每次写后立即整库快照（无防抖：杜绝窗口期刷新丢档；export ~100KB，开销可忽略）
  repo.onWrite = () => {
    service
      .exportBytes()
      .then(idbSave)
      .catch((err) => console.warn('[db] IndexedDB 备份失败:', err));
  };

  return repo;
}
