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
// 手感：整個畫面會跟著手指被「拉下來」（越拉越有阻力），底下露出圓環，圓環隨距離填滿、
// 過門檻時箭頭翻轉並震動一下；放開後畫面會停在上方轉圈，不夠力則彈回去。
// 不會觸發的情況：還沒登入、設定/對話框開著、手指在輸入框或筆記編輯區、頁面或內層區塊沒捲到頂。
(function() {
  const THRESHOLD = 64;    // 畫面被拉下超過這個距離（px）放開才會重整
  const MAX_OFF   = 120;   // 畫面最多被拉下多少（阻尼的極限）
  const HOLD      = 56;    // 重整中，畫面停留的位置
  const DAMP      = 120;   // 阻尼係數：越大越好拉
  const RING_C    = 2 * Math.PI * 15;   // 圓環周長
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startY = 0, startX = 0, tracking = false, pulling = false, dy = 0, off = 0, armedPrev = false, busy = false, ind = null;

  const css = document.createElement('style');
  css.textContent = `
    #ptrIndicator{position:fixed;left:50%;top:env(safe-area-inset-top,0px);z-index:-1;width:36px;height:36px;margin-left:-18px;
      border-radius:50%;background:var(--bg2,#fff);box-shadow:0 2px 10px rgba(58,110,165,.22);
      display:grid;place-items:center;pointer-events:none;opacity:0;will-change:transform,opacity}
    #ptrIndicator svg{position:absolute;inset:0;width:36px;height:36px;transform:rotate(-90deg)}
    #ptrIndicator .ptr-bg{fill:none;stroke:rgba(58,110,165,.15);stroke-width:2.5}
    #ptrIndicator .ptr-ring{fill:none;stroke:#3A6EA5;stroke-width:2.5;stroke-linecap:round;
      stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:${RING_C.toFixed(2)}}
    #ptrIndicator .ptr-ar{position:relative;font-size:15px;line-height:1;color:#3A6EA5;
      transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .15s}
    #ptrIndicator.armed .ptr-ar{transform:rotate(180deg)}
    #ptrIndicator.busy .ptr-ar{opacity:0}
    #ptrIndicator.busy svg{animation:ptrSpin .8s linear infinite}
    #ptrIndicator.busy .ptr-ring{stroke-dashoffset:${(RING_C * 0.72).toFixed(2)}!important}
    #ptrIndicator.snap{transition:transform .38s cubic-bezier(.34,1.3,.64,1),opacity .25s}
    body.ptr-snap #todoRoot,body.ptr-snap #page-notes{transition:transform .38s cubic-bezier(.34,1.3,.64,1)}
    @keyframes ptrSpin{to{transform:rotate(270deg)}}`;
  document.head.appendChild(css);

  const layers = () => document.querySelectorAll('#todoRoot, #page-notes');

  function getInd() {
    if (ind) return ind;
    ind = document.createElement('div');
    ind.id = 'ptrIndicator';
    ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = '<svg viewBox="0 0 36 36"><circle class="ptr-bg" cx="18" cy="18" r="15"/><circle class="ptr-ring" cx="18" cy="18" r="15"/></svg><span class="ptr-ar">↓</span>';
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

  // 把畫面與圓環放到 y（px）的位置
  function place(y, progress) {
    const el = getInd();
    layers().forEach(l => { l.style.transform = y ? 'translate3d(0,' + y + 'px,0)' : ''; });
    // 圓環坐在被拉開的空隙正中間；一開始被畫面蓋住，隨著拉開慢慢「浮」出來
    const sc = 0.55 + 0.45 * Math.min(progress, 1);
    el.style.transform = 'translate3d(0,' + (y / 2 - 18) + 'px,0) scale(' + sc + ')';
    el.style.opacity = String(Math.min(progress * 1.5, 1));
    el.querySelector('.ptr-ring').style.strokeDashoffset = String(RING_C * (1 - Math.min(progress, 1)));
  }

  function render() {
    off = MAX_OFF * (1 - Math.exp(-dy / DAMP));   // 阻尼：越往下越難拉
    const armed = off >= THRESHOLD;
    place(off, off / THRESHOLD);
    getInd().classList.toggle('armed', armed);
    if (armed && !armedPrev) { try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} }
    armedPrev = armed;
  }

  function springBack() {
    const el = getInd();
    if (!RM) { document.body.classList.add('ptr-snap'); el.classList.add('snap'); }
    el.classList.remove('armed');
    place(0, 0);
    setTimeout(cleanup, 420);
  }

  function cleanup() {
    document.body.classList.remove('ptr-snap');
    layers().forEach(l => { l.style.transform = ''; });
    if (ind) ind.classList.remove('snap');
  }

  // 真正重整前先把還沒送出的資料推上雲端，並記住目前在看的筆記頁
  window._ptrReload = function() {
    try { if (typeof _pushNotesEmergency === 'function') _pushNotesEmergency('下拉重整'); } catch (e) {}
    try { if (typeof _pushStateEmergency === 'function') _pushStateEmergency(); } catch (e) {}
    try { if (typeof window._saveReloadRestoreState === 'function') window._saveReloadRestoreState(); } catch (e) {}
    setTimeout(() => location.reload(), 450);
  };

  document.addEventListener('touchstart', e => {
    tracking = pulling = false; dy = 0; off = 0; armedPrev = false;
    if (e.touches.length !== 1) return;
    if (blocked(e.target)) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking) return;
    const y = e.touches[0].clientY - startY;
    const x = e.touches[0].clientX - startX;
    if (!pulling) {
      if (y < 0 || Math.abs(x) > Math.abs(y)) { if (y < -6 || Math.abs(x) > 12) tracking = false; return; }
      if (y < 10) return;
      pulling = true;
      document.body.classList.remove('ptr-snap');
      getInd().classList.remove('snap', 'busy', 'armed');
    }
    dy = Math.max(0, y - 10);   // 扣掉起手的 10px，畫面才會「貼著手指」開始動
    if (e.cancelable) e.preventDefault();   // 擋掉瀏覽器自己的下拉動作，避免跟我們的重整疊在一起
    render();
  }, { passive: false });

  function end() {
    if (!tracking) return;
    const wasPulling = pulling, armed = off >= THRESHOLD;
    tracking = pulling = false;
    if (wasPulling && armed) {
      busy = true;
      const el = getInd();
      if (!RM) { document.body.classList.add('ptr-snap'); el.classList.add('snap'); }
      el.classList.remove('armed');
      el.classList.add('busy');
      place(HOLD, 1);                     // 畫面停在上方，圓環轉圈
      el.style.opacity = '1';
      window._ptrReload();
    } else if (wasPulling) {
      springBack();
    }
    dy = 0; off = 0; armedPrev = false;
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => {
    const was = pulling;
    tracking = pulling = false; dy = 0; off = 0; armedPrev = false;
    if (was && !busy) springBack();
  }, { passive: true });
})();
