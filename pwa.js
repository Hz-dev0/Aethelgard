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


// ── 下拉重整（Pull-to-Refresh）──────────────────────────────────────────
// 手機 PWA 沒有網址列也沒有重整鍵，這裡自己做：頁面在最上方時往下拉超過門檻、放開就重整。
// 不會觸發的情況：還沒登入、設定/對話框開著、手指在輸入框或筆記編輯區、頁面或內層區塊沒捲到頂。
(function() {
  const THRESHOLD = 70;   // 拉超過這個距離（px）放開才會重整
  const MAX_PULL  = 130;
  let startY = 0, startX = 0, tracking = false, pulling = false, dist = 0, busy = false, ind = null;

  const css = document.createElement('style');
  css.textContent = `
    #ptrIndicator{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:100002;
      display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:22px;font-size:13px;
      background:var(--bg2,#fff);color:var(--text-dim,#555);border:1px solid var(--border,rgba(58,110,165,.2));
      box-shadow:0 4px 16px rgba(58,110,165,.18);pointer-events:none;opacity:0;
      transform:translate(-50%,-70px);transition:transform .22s ease,opacity .22s ease;white-space:nowrap}
    #ptrIndicator.dragging{transition:none}
    #ptrIndicator .ptr-ic{display:inline-block;transition:transform .15s}
    #ptrIndicator.armed .ptr-ic{transform:rotate(180deg)}
    #ptrIndicator.busy .ptr-ic{animation:ptrSpin .8s linear infinite}
    @keyframes ptrSpin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(css);

  function getInd() {
    if (ind) return ind;
    ind = document.createElement('div');
    ind.id = 'ptrIndicator';
    ind.innerHTML = '<span class="ptr-ic">↓</span><span class="ptr-tx">下拉重整</span>';
    document.body.appendChild(ind);
    return ind;
  }

  function blocked(t) {
    if (busy) return true;
    if (!document.body.classList.contains('auth-ready')) return true;
    const api = document.getElementById('apiModal');
    if (api && api.classList.contains('open')) return true;
    const ov = document.getElementById('td-ov');
    if (ov && ov.classList.contains('on')) return true;
    const dlg = document.getElementById('notes-dlg-overlay');
    if (dlg && dlg.classList.contains('visible')) return true;
    if (!t || !t.closest) return true;
    if (t.closest('textarea,input,select,[contenteditable="true"],#notes-md-toolbar,#notes-search-bar')) return true;
    const se = document.scrollingElement || document.documentElement;
    // 這個 app 的捲動容器是 body（html 是 overflow:hidden），三個地方都要看
    if (window.scrollY > 0 || se.scrollTop > 0 || document.body.scrollTop > 0) return true;
    for (let e = t; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight && e.scrollTop > 0) return true;
    }
    return false;
  }

  function render() {
    const el = getInd();
    const p = Math.min(dist, MAX_PULL);
    el.classList.add('dragging');
    el.style.opacity = String(Math.min(p / THRESHOLD, 1));
    el.style.transform = 'translate(-50%,' + (Math.min(p * 0.6, 56) - 70) + 'px)';
    const armed = dist >= THRESHOLD;
    el.classList.toggle('armed', armed);
    el.querySelector('.ptr-tx').textContent = armed ? '放開重整' : '下拉重整';
  }

  function hide() {
    if (!ind) return;
    ind.classList.remove('dragging', 'armed');
    ind.style.opacity = '0';
    ind.style.transform = 'translate(-50%,-70px)';
  }

  // 真正重整前先把還沒送出的資料推上雲端，並記住目前在看的筆記頁
  window._ptrReload = function() {
    try { if (typeof _pushNotesEmergency === 'function') _pushNotesEmergency('下拉重整'); } catch (e) {}
    try { if (typeof _pushStateEmergency === 'function') _pushStateEmergency(); } catch (e) {}
    try { if (typeof window._saveReloadRestoreState === 'function') window._saveReloadRestoreState(); } catch (e) {}
    setTimeout(() => location.reload(), 450);
  };

  document.addEventListener('touchstart', e => {
    tracking = pulling = false; dist = 0;
    if (e.touches.length !== 1) return;
    if (blocked(e.target)) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!pulling) {
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { if (dy < -6 || Math.abs(dx) > 12) tracking = false; return; }
      if (dy < 10) return;
      pulling = true;
    }
    dist = dy;
    if (e.cancelable) e.preventDefault();   // 擋掉瀏覽器自己的下拉動作，避免跟我們的重整疊在一起
    render();
  }, { passive: false });

  function end() {
    if (!tracking) return;
    const wasPulling = pulling, armed = dist >= THRESHOLD;
    tracking = pulling = false;
    if (wasPulling && armed) {
      busy = true;
      const el = getInd();
      el.classList.remove('dragging', 'armed');
      el.classList.add('busy');
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,0)';
      el.querySelector('.ptr-ic').textContent = '⟳';
      el.querySelector('.ptr-tx').textContent = '重整中…';
      window._ptrReload();
    } else {
      hide();
    }
    dist = 0;
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { tracking = pulling = false; dist = 0; hide(); }, { passive: true });
})();
