/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab — Service Worker（步骤 9 / D15 PWA 离线缓存）
 * -----------------------------------------------------------------------------
 * 策略：
 * - 安装期：预缓存应用外壳（index.html + 构建产物由运行时兜底）
 * - 运行时：cache-first（同源 GET 全部缓存，命中即回；未命中请求并入库）
 *   本作为纯静态单机游戏，资源不变式成立（每次发版文件名带 hash），
 *   cache-first 命中率最高且离线完全可用。
 * - 版本升级：SW 文件更新触发 activate，清理旧版本缓存。
 * =============================================================================
 */
const CACHE_NAME = 'contraption-lab-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 仅处理同源 GET（wasm/assets 均同源）
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 页面导航请求走 network-first：保证发版后首刷即拿到新 index（旧版 cache-first
  // 会让用户停留在旧 bundle，表现为"修了没反应"——2026-10-19 用户实测踩坑）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // 其余静态资源 cache-first（带 hash 的文件名不变式成立）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    }),
  );
});
