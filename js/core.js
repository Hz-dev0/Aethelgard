/* 精簡啟動檔：取代舊 tasks.js 的 init()，只保留「登入 → 雲端載入 → 筆記」所需的流程。
   下面的空函式是給 sync.js / state.js / auth.js / firebase.js 裡殘留的呼叫用的（舊功能已移除）。 */
var lotteryState = { todayDate: '', todayDone: 0, todayFlipped: 0, rmSlot: null };
var _recurState = {}, ctxTargetId = null;
function _noop() {}
var saveLottery = _noop, renderStats = _noop, renderLottery = _noop, renderRewards = _noop, renderEnergyDots = _noop, renderSandbox = _noop, renderTree = _noop, renderTasks = _noop, renderTodayPanel = _noop, renderRoutineList = _noop, checkTaskDates = _noop, initRoutines = _noop, scheduleNextReset = _noop, navigateToTask = _noop;

function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + id);
  if (el) el.classList.add('active');
}

async function init() {
  let resolved = false, ref = null;
  const early = () => { if (!resolved) { resolved = true; if (ref) ref(); } };
  if (typeof window._registerFirebaseReadyCallback === 'function') window._registerFirebaseReadyCallback(early);
  else window._onFirebaseReadyCallback = early;
  window._fbGuestReadyResolve = early;

  await new Promise((resolve) => {
    if (resolved) { resolve(); return; }
    ref = resolve;
    const t = setInterval(() => { if (resolved) { clearInterval(t); resolve(); } }, 500);
    setTimeout(() => { clearInterval(t); if (resolved) resolve(); }, 30000);
  });

  if (window._fbIsOwner && window._fbUid) { try { loadStateLocal(); } catch (e) {} }

  const ok = await loadFromCloud();
  if (ok) state._initDone = true;
  window._notesUserEdited = false;
  _markSyncWrite();
  if (window._fbUid) _startRealtimeListener(window._fbUid);

  if (ok) {
    closeOwnerLoginOverlay();
    syncToCloud();
  } else {
    let localOk = false;
    try { localOk = loadStateLocal(); } catch (e) {}
    closeOwnerLoginOverlay();
    if (localOk) { state._initDone = true; showToast('⚠️ 雲端讀取失敗，已從本地備份還原'); }
    else showToast('⏳ 正在連線雲端，請稍候…');
    const delays = [3000, 6000, 10000, 15000, 20000];
    let n = 0;
    const retry = async () => {
      if (state._initDone && !localOk) return;
      n++;
      if (n > delays.length) { showToast('❌ 雲端連線失敗，請重新整理再試'); return; }
      const r = await loadFromCloud();
      if (r) { state._initDone = true; syncToCloud(); showToast('✓ 雲端資料已載入'); }
      else setTimeout(retry, delays[n] || 20000);
    };
    setTimeout(retry, delays[0]);
  }
  if (!window._fbUid && !state._initDone) state._initDone = true;

  // 整頁重整後回到原本在看的筆記頁
  if (window._fbIsOwner === true) {
    try {
      const raw = sessionStorage.getItem('aethelgard_reload_restore');
      if (raw) {
        sessionStorage.removeItem('aethelgard_reload_restore');
        const r = JSON.parse(raw);
        if (r && r.page === 'notes' && typeof notesFolderData !== 'undefined' && typeof r.notesTab === 'number' && notesFolderData[r.notesTab]) {
          notesTabIndex = r.notesTab;
          if (typeof r.notesPage === 'number') notesFolderData[notesTabIndex].currentPage = r.notesPage;
          if (typeof showPage === 'function') showPage('notes');
        }
      }
    } catch (e) {}
  }
}
init();
