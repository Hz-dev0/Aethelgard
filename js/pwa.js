// ── PWA Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '');
    const swPath = base + 'sw.js';

    // ★ 修正：只有「這個分頁載入時就已經被舊版 SW 控制」才代表這是回頭客、
    //   而且真的有新版本要接管（controllerchange 才有意義）。
    //   無痕模式 / 第一次造訪時 navigator.serviceWorker.controller 必定是 null
    //   （因為沒有任何舊版 SW 快取），這種情況下走 SKIP_WAITING + reload
    //   只是在「安裝」，不是在「更新」，卻會誤觸 reload，把剛登入的訪客/使用者
    //   在幾秒內強制踢回鎖屏、也可能打斷還沒送出的雲端同步。
    //   → 沒有舊 controller 時，讓瀏覽器照正常流程啟用新 SW 即可，不強制介入。
    const _hadControllerAtStart = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register(swPath, { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered:', reg.scope);

        // ★ 每次開啟都主動 check update，不等瀏覽器自己輪詢（預設 24 小時才查一次）
        reg.update().catch(() => {});

        function _applyUpdate(worker) {
          if (!_hadControllerAtStart) return; // 第一次安裝：不強制介入，不重整
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              // ★ 只有「真的有舊版本在控制頁面」時，才強制新版接管
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

        // ★ 已有 waiting worker（上次更新沒完成）且真的是回頭客，才直接套用
        if (reg.waiting && _hadControllerAtStart) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(err => console.warn('SW registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // ★ 首次安裝觸發的 controllerchange（clients.claim() 造成）不重整，
      //   只有「這個分頁一開始就有舊 controller」時，才代表是真的版本更新。
      if (!_hadControllerAtStart) return;
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
