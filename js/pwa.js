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
      if (!refreshing) {
        refreshing = true;
        // ★ SW 偵測到新版時也會走這裡重整，跟 notes.js 裡「離開 15 秒回來重整」
        //   是兩條完全獨立的路徑，這裡沒存檔的話一樣會被丟回生命樹頁。
        //   用 typeof 檢查是因為理論上這個事件有極小機率在 notes.js 載入完成前就觸發，
        //   保守起見加個防呆，避免噴錯擋掉重整本身。
        if (typeof window._saveReloadRestoreState === 'function') window._saveReloadRestoreState();
        location.reload();
      }
    });
  });
}
