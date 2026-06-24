// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '');
    const swPath = base + 'sw.js';
    navigator.serviceWorker.register(swPath, { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered:', reg.scope);

        // ★ 每次開啟都主動 check update，不等瀏覽器自己輪詢（預設 24 小時才查一次）
        reg.update().catch(() => {});

        function _applyUpdate(worker) {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              // ★ 不管有沒有舊 controller，直接送 SKIP_WAITING，強制新版接管
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
          // ★ 若 worker 已經在 installed 狀態（錯過 statechange），直接送
          if (worker.state === 'installed') {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        }

        reg.addEventListener('updatefound', () => {
          _applyUpdate(reg.installing);
        });

        // ★ 已有 waiting worker（上次更新沒完成）也直接套用
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(err => console.warn('SW registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; location.reload(); }
    });
  });
}
