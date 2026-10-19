/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: vite.config.ts
 * -----------------------------------------------------------------------------
 * 用途: Vite 构建与 Vitest 单测统一配置
 *       - base './' 使 dist 产物可部署在任意子路径（静态服务器直接可用）
 *       - '@' 别名指向 src 目录
 *       - 测试环境 node（当前仅纯逻辑单测，无 DOM 依赖）
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径基址：保证打包后 index.html 用相对引用，拷贝到任何静态目录都能跑
  base: './',
  resolve: {
    alias: {
      // '@' → src 目录，与 tsconfig.json 的 paths 保持一致
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // sqlite-wasm 自带 wasm 定位逻辑，排除预打包（否则 wasm 资源无法在 Worker 内解析）
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  // Vitest 配置：纯逻辑单测运行在 node 环境，速度最快
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
