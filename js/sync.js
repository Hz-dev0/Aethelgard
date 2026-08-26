// ── OTP 格子控制器 ──────────────────────────────────────────────
(function() {
  function initOtp() {
    const grid = document.getElementById('otpGrid');
    const hiddenInput = document.getElementById('guestTokenInput');
    if (!grid) return;

    // 取得 6 個真實 input 格子
    const cells = Array.from(grid.querySelectorAll('.otp-cell-input'));
    if (cells.length !== 6) return;

    // 同步所有格子的值到 hiddenInput，供 submitGuestToken() 讀取
    function syncHidden() {
      const val = cells.map(c => c.value).join('');
      if (hiddenInput) hiddenInput.value = val;
      return val;
    }

    function flashError() {
      cells.forEach(c => {
        c.classList.add('otp-error');
        setTimeout(() => c.classList.remove('otp-error'), 400);
      });
    }

    // 聚焦指定格子（不用 select()，避免觸發額外 input 事件）
    function focusCell(idx) {
      idx = Math.max(0, Math.min(5, idx));
      cells[idx].focus();
    }

    // 在 input 事件中延後移動焦點，確保當前事件完全結束
    function moveFocus(idx) {
      setTimeout(() => focusCell(idx), 0);
    }

    cells.forEach((cell, i) => {
      // 點擊時聚焦，選取現有字元方便直接覆寫
      cell.addEventListener('click', () => {
        setTimeout(() => cell.select(), 0);
      });

      // keydown：導航、刪除、覆寫現有值
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitGuestToken();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (cell.value) {
            cell.value = '';
            cell.classList.remove('otp-filled');
            syncHidden();
          } else if (i > 0) {
            cells[i - 1].value = '';
            cells[i - 1].classList.remove('otp-filled');
            syncHidden();
            focusCell(i - 1);
          }
          return;
        }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); focusCell(i - 1); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); focusCell(i + 1); return; }

        // 格子已有值時按數字：先清空，讓 input 事件只看到 1 個新字
        if (/^\d$/.test(e.key) && cell.value) {
          cell.value = '';
          cell.classList.remove('otp-filled');
        }
      });

      // input：只負責把值正規化、更新 class、移動焦點
      cell.addEventListener('input', () => {
        const raw = cell.value.replace(/\D/g, '');

        if (!raw) {
          cell.value = '';
          cell.classList.remove('otp-filled');
          syncHidden();
          return;
        }

        // 取第一個數字（正常情況 raw.length===1；防呆：取首碼）
        const digit = raw[0];
        cell.value = digit;
        cell.classList.add('otp-filled');
        cell.classList.add('otp-pop');
        setTimeout(() => cell.classList.remove('otp-pop'), 200);
        syncHidden();

        if (i < 5) {
          moveFocus(i + 1);
        } else {
          const all = syncHidden();
          if (/^\d{6}$/.test(all)) setTimeout(() => submitGuestToken(), 0);
        }
      });

      // paste：在任何格子貼上整段驗證碼
      cell.addEventListener('paste', e => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        pasted.split('').forEach((d, j) => {
          if (cells[j]) { cells[j].value = d; cells[j].classList.add('otp-filled'); }
        });
        moveFocus(Math.min(pasted.length, 5));
        const all = syncHidden();
        if (/^\d{6}$/.test(all)) setTimeout(() => submitGuestToken(), 0);
      });
    });

    // expose reset
    window._otpReset = function() {
      cells.forEach(c => { c.value = ''; c.classList.remove('otp-filled','otp-error','otp-pop'); });
      if (hiddenInput) hiddenInput.value = '';
      focusCell(0);
    };

    // expose error flash
    window._otpFlashError = flashError;

    // auto-focus 第一格
    focusCell(0);

    // 當 overlay 重新顯示時，自動聚焦第一格
    const observer = new MutationObserver(() => {
      const overlay = document.getElementById('ownerLoginOverlay');
      if (overlay && overlay.style.display !== 'none') {
        setTimeout(() => focusCell(0), 80);
      }
    });
    const overlay = document.getElementById('ownerLoginOverlay');
    if (overlay) observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOtp);
  } else {
    initOtp();
  }
  window._initOtpFn = initOtp;
})();

function setApiStatus(type, msg) {
  const el = document.getElementById('apiStatus');
  el.className = 'api-status' + (type ? ' ' + type : '');
  el.textContent = msg || '';
}

// saveApiUrl is no longer used (replaced by Firebase)
// Kept as stub to avoid errors if called
async function saveApiUrl(fragment) {
  // Firebase 模式：不需要 fragment，直接回傳 true
  setApiStatus('ok', '✓ Firebase 自動連線，無需手動設定');
  return true;
}

async function saveApiSettings() {
  // Save reset time
  const resetTime = document.getElementById('resetTimeInput').value || '04:00';
  localStorage.setItem('aethelgard_reset_time', resetTime);
  scheduleNextReset();

  // Save neglect days
  const neglectEl = document.getElementById('neglectDaysInput');
  if (neglectEl) {
    const days = parseInt(neglectEl.value) || 7;
    localStorage.setItem('aethelgard_neglect_days', String(Math.max(1, days)));
  }

  // Firebase 模式：不需要設定 API fragment，直接儲存並關閉
  showToast('✓ 設定已儲存');
  if (typeof syncToCloud === 'function') syncToCloud();
  setTimeout(closeApiModal, 600);
}

function clearApiUrl() {
  // Firebase 模式：此函式保留但不再主動呼叫
  localStorage.removeItem(API_STORAGE_KEY);
  localStorage.removeItem(API_KEY_FRAGMENT_STORE);
  setApiStatus('ok', '已清除舊設定');
}

// ── 複製我的 UID ──
function copyMyUid() {
  const uid = window._fbUid || localStorage.getItem('aethelgard_fb_uid') || '';
  if (!uid) { setApiStatus('err', '尚未取得裝置 ID，請稍後再試'); return; }
  navigator.clipboard.writeText(uid).then(() => {
    setApiStatus('ok', '✓ 已複製！到其他裝置的設定頁貼上即可');
  }).catch(() => {
    // fallback
    const el = document.getElementById('apiKeyFragment');
    if (el) { el.select(); document.execCommand('copy'); }
    setApiStatus('ok', '✓ 已複製（請手動選取複製）');
  });
}
window.copyMyUid = copyMyUid;

// ── 匯入其他裝置的 UID（切換資料來源）──
async function importUid() {
  const input = document.getElementById('importUidInput');
  const targetUid = (input ? input.value : '').trim();
  if (!targetUid) { setApiStatus('err', '請貼上其他裝置的 ID'); return; }
  const currentUid = window._fbUid || localStorage.getItem('aethelgard_fb_uid') || '';
  if (targetUid === currentUid) { setApiStatus('ok', '✓ 這就是目前的裝置 ID，無需切換'); return; }
  if (targetUid.length < 10) { setApiStatus('err', 'ID 格式不正確，請重新確認'); return; }

  setApiStatus('', '正在切換…');
  try {
    // 先用目標 UID 直接讀取（不改 window._fbUid，避免影響目前的寫入）
    const testRef = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
    const testSnap = await window._fbGetDoc(testRef);

    if (!testSnap.exists()) {
      setApiStatus('err', '找不到對應資料，請確認 ID 是否正確');
      return;
    }

    const data = testSnap.data();
    if (!data || !Array.isArray(data.tasks)) {
      setApiStatus('err', '資料格式異常，請確認來源裝置已有資料');
      return;
    }

    // 確認有資料後，才切換身份
    localStorage.setItem('aethelgard_fb_uid_override', targetUid);
    window._fbUid = targetUid;
    try { localStorage.setItem('aethelgard_fb_uid', targetUid); } catch(e2) {}
    // ★ 修正：UID 切換後清除 hash 快取，防止 syncToCloud 誤判「沒有變化」而跳過推送
    if (typeof _lastSyncHash !== 'undefined') _lastSyncHash = '';
    // ★ 重新綁定即時監聽到新的 UID
    _startRealtimeListener(targetUid);

    // 直接套用讀到的資料（不再重新呼叫 loadFromCloud 避免重複讀取）
    const ok = await loadFromCloud();
    if (ok) {
      state._initDone = true;
      saveStateLocal();
      renderEnergyDots(); renderSandbox(); renderAll(); initRoutines();
      setApiStatus('ok', '✓ 已切換！資料已載入');
      showToast('✓ 已切換到目標裝置的資料');
      if (input) input.value = '';
    } else {
      window._fbUid = currentUid;
      localStorage.removeItem('aethelgard_fb_uid_override');
      setApiStatus('err', '載入失敗，請再試一次');
    }
  } catch(e) {
    console.error('[importUid] 錯誤:', e);
    setApiStatus('err', '切換失敗：' + (e.code || e.message));
  }
}

let isSyncing = false;
let _pendingSync = false;
let _syncRetryCount = 0;
let _syncRetryTimer = null;    // 追蹤 retry timer，防止疊加
let _syncDebounceTimer = null; // debounce：合批短時間內連續的 sync 呼叫為一次
let _routineResetDate = null;  // in-memory 快取（存重置時間戳字串）
let _lastSyncHash = '';        // ★ 增量防重：上次成功推送的資料 hash

// 設為 true 可在開發時啟用 sync 偵錯訊息；正式部署請保持 false
const _SYNC_DEBUG = false;
function _dbg(...args) { if (_SYNC_DEBUG) console.log(...args); }

// ★ 改用完整 JSON 字串做 hash，避免首尾相同但中間不同被誤判為一致
function _quickHash(obj) {
  try {
    return JSON.stringify(obj);
  } catch(e) { return ''; }
}

// ── 「本機是否真的有雲端還沒看過的變動」判斷 ──
// 背景（真實踩過的資料被覆蓋事故）：過去的做法是拿 savedAt（本機快照
// 「最後一次被寫入」的時間）跟雲端 updatedAt 比較，本機比較新就優先採用本機。
// 但 saveStateLocal() 每次呼叫都會把 savedAt 蓋成「現在」，不管內容有沒有真的
// 改變——裝置只要重新打開、跑一次本機渲染流程，即使裡面裝的其實是好幾個月前
// 的舊資料，savedAt 也會被蓋成「剛剛」。這會讓「本機比較新」的判斷幾乎每次
// 都成立，導致陳舊的本機資料被誤判成最新版本，接著又被 init 流程自動推回雲端，
// 蓋掉真正的最新資料——完全不需要使用者做任何操作就會發生。
// 修正：改成記錄「上一次成功跟雲端對齊時的內容雜湊」，只有本機目前內容真的跟
// 那次對齊時不一樣，才代表這台裝置存在雲端還沒看過的變動，這時才進一步比對
// 時間戳來決定先後；內容沒變的話，無論 savedAt 看起來多新都不該優先採用本機。
const SYNCED_HASH_KEY = 'aethelgard_synced_hash';
function _markStateSynced(fields) {
  try { localStorage.setItem(SYNCED_HASH_KEY, _quickHash(fields)); } catch(e) {}
}
function _localHasUnsyncedEdit(localFields) {
  try {
    const syncedHash = localStorage.getItem(SYNCED_HASH_KEY);
    if (!syncedHash) return true; // 從沒記錄過對齊點（例如剛升級這個修正）：保守起見退回舊行為，交由時間戳判斷
    return _quickHash(localFields) !== syncedHash;
  } catch(e) { return true; }
}
const SYNCED_LOTTERY_HASH_KEY = 'aethelgard_synced_lottery_hash';
function _markLotterySynced(lottery) {
  try { localStorage.setItem(SYNCED_LOTTERY_HASH_KEY, _quickHash(lottery)); } catch(e) {}
}
function _localLotteryHasUnsyncedEdit(localLottery) {
  try {
    const syncedHash = localStorage.getItem(SYNCED_LOTTERY_HASH_KEY);
    if (!syncedHash) return true;
    return _quickHash(localLottery) !== syncedHash;
  } catch(e) { return true; }
}

async function loadFromCloud() {
  if (!window._fbUid) return false;
  try {
    const data = await _fbLoad();
    if (!data) return false;

    const hasCloudData = data && Array.isArray(data.tasks) && data.tasks.length > 0;
    if (data && Array.isArray(data.tasks)) {
      // ── 安全檢查：若雲端是空陣列但本地有資料，保留本地
      // ★ 修正：只有在「這個 UID 是本裝置自己產生的匿名 UID」時才做 fallback；
      //   若是透過 token/importUid 切換過來的 ownerUid，雲端空陣列代表真的沒任務，
      //   不應用本地舊快取覆蓋。用 _fbAuthUid !== _fbUid 來判斷是否為訪客/切換狀態。
      const localBackup = (function() {
        try { return JSON.parse(localStorage.getItem('aethelgard_state_local') || 'null'); } catch(e) { return null; }
      })();
      const localHasTasks = localBackup && Array.isArray(localBackup.tasks) && localBackup.tasks.length > 0;
      const isOwnUid = !window._fbAuthUid || window._fbAuthUid === window._fbUid;
      // ★ Bug fix：分配願望碎片／完成任務拿到碎片後，syncToCloud() 有 debounce（手機 5 秒／
      //   PC 30 秒）才會真的推上雲端。若使用者在這段空窗期重新整理頁面，雲端文件裡的 rewards／
      //   wishPoints 還是舊的，這裡原本會直接無條件用雲端資料覆蓋，導致「分配完重整又變回原樣」。
      //   解法：比較本機快照的 savedAt 跟雲端文件的 updatedAt，本機較新時（代表這台裝置有
      //   還沒推上雲端的變動）優先採用本機的 rewards／wishPoints，避免被舊的雲端資料蓋掉。
      const cloudUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
      const localSavedAt = localBackup && typeof localBackup.savedAt === 'number' ? localBackup.savedAt : 0;
      const _localCoreFields = localBackup ? {
        tasks: localBackup.tasks, rewards: localBackup.rewards,
        doneHistory: localBackup.doneHistory, wishPoints: localBackup.wishPoints
      } : null;
      const localIsNewer = isOwnUid && localSavedAt > cloudUpdatedAt
        && (!_localCoreFields || _localHasUnsyncedEdit(_localCoreFields));
      if (!hasCloudData && localHasTasks && isOwnUid) {
        console.warn('Firebase 無資料但本地有，保留本地並重新推送');
        state.tasks        = localBackup.tasks;
        state.sandbox      = localBackup.sandbox      || [];
        state.done         = localBackup.done         || 0;
        state.rewards      = localBackup.rewards      || [];
        state.customQuotes = localBackup.customQuotes || [];
        state.energy       = localBackup.energy       || 0;
        state.doneHistory  = localBackup.doneHistory  || [];
        state.todayOrder   = localBackup.todayOrder   || [];
        state.wishPoints   = typeof localBackup.wishPoints === 'number' ? localBackup.wishPoints : 0;
        state.routines     = Array.isArray(localBackup.routines) ? localBackup.routines : [];
        state.routineResetDate = localBackup.routineResetDate || null;
        return true;
      }
      // ★ Bug fix：勾選完成任務後，syncToCloud 是即時推送沒錯，但寫入 Firebase 跟
      //   下面的頁面重新整理/切換分頁是兩個各自獨立的非同步流程——如果使用者在
      //   剛完成任務的幾秒內就重新整理頁面（或切到背景太久、另一個裝置的舊分頁
      //   剛好在這之後又推了一次舊資料上去），這裡原本會無條件用雲端資料覆蓋
      //   state.tasks，導致「剛勾選完成的任務消失」，但 doneHistory 若剛好沒被
      //   同一波覆蓋覆蓋掉，月曆/成長軌跡那邊卻還留著紀錄，兩邊對不起來。
      //   解法比照 rewards／wishPoints 的作法：本機快照比雲端新時，優先採用本機的
      //   tasks／doneHistory，不要被舊的雲端資料蓋掉。
      state.tasks = (localIsNewer && Array.isArray(localBackup.tasks)) ? localBackup.tasks : data.tasks;
      {
        const _lrk = localStorage.getItem('aethelgard_last_reset');
        const _lrkTs = _lrk && /^\d{10,}$/.test(_lrk) ? parseInt(_lrk) : 0;
        const _cycleTs = typeof getLastResetTimestamp === 'function' ? getLastResetTimestamp() : 0;
        if (_lrkTs >= _cycleTs && _cycleTs > 0) {
          // ★★ Bug fix（真正找到「兩天前完成的任務今天又出現」的元兇）：
          //   這裡原本用 new Date(_cycleTs).toISOString().slice(0,10) 取得「本次重置點」
          //   對應的日期字串，但 toISOString() 是 UTC 時間，不是本地時區！
          //   對 UTC+8（例如台灣）的使用者來說，重置時間通常設在清晨（例如 04:00），
          //   換算成 UTC 會落在「前一個 UTC 日期的 20:00」，toISOString() 切出來的日期
          //   會整整少一天。全專案其他地方（runDailyReset()、localDateStr() 等）都刻意
          //   避開這個陷阱、統一用本地時區的 YYYY-MM-DD，只有這裡漏用了。
          //   結果：t.completedAt < _cycleDate 這個比較基準日期算錯，變成只有「2 天前（以上）
          //   完成」的重複任務才會被打回未完成，「昨天」完成的反而不會被正確重置——
          //   跟預期的「重置週期一到，之前完成的重複任務就該重新出現」完全錯位，
          //   使用者感覺就是「已經是兩天前的完成紀錄，怎麼突然又跑出來要重做」。
          const _cycleDate = localDateStr(new Date(_cycleTs));
          state.tasks.forEach(t => {
            if (!t.recurring || t.recurMode === 'interval') return;
            if (t.done && t.completedAt && t.completedAt < _cycleDate) {
              t.done = false; t.scheduledFor = null; t.scheduledAt = null; t.status = null;
            }
          });
        }
      }
      state.sandbox = data.sandbox || [];
      state.done    = data.done    || 0;
      state.rewards = (localIsNewer && Array.isArray(localBackup.rewards)) ? localBackup.rewards : (data.rewards || []);
      state.customQuotes = data.customQuotes || [];
      state.energy  = data.energy  || 0;
      state.doneHistory = (localIsNewer && Array.isArray(localBackup.doneHistory)) ? localBackup.doneHistory : (data.doneHistory || []);
      state.todayOrder  = data.todayOrder  || [];
      state.wishPoints  = (localIsNewer && typeof localBackup.wishPoints === 'number')
        ? localBackup.wishPoints
        : (typeof data.wishPoints === 'number' ? data.wishPoints : (state.wishPoints || 0));
      state.morningDialogShownDate = data.morningDialogShownDate || state.morningDialogShownDate || null;
      state.routineResetDate = data.routineResetDate || state.routineResetDate || null;
      // ── 例行任務 merge
      // ★ 修正「刪除後又復活」bug：原本的聯集合併分不出「本機新增、雲端還沒收到」
      //   跟「雲端已刪除、本機還留著舊快取」——兩者都是「雲端沒有、本機有」，
      //   原邏輯一律當成前者補回去，導致已刪除的例行任務在下次讀取雲端資料時復活，
      //   而且還會被自動 syncToCloud() 反推回雲端，讓刪除紀錄永久失效。
      //   解法：用 tombstone（刪除標記）清單記住「這個 id 曾經被刪除過」，
      //   合併雲端/本機兩份 tombstone 後，任何在 tombstone 裡的 id 一律不補回 routines。
      {
        const cloudRoutines = Array.isArray(data.routines) ? data.routines : [];
        const localRoutines = Array.isArray(state.routines) ? state.routines : [];
        const cloudDeletedLog = Array.isArray(data.routinesDeletedLog) ? data.routinesDeletedLog : [];
        const localDeletedLog = Array.isArray(state.routinesDeletedLog) ? state.routinesDeletedLog : [];

        // 合併 tombstone：同一個 id 取最新的刪除時間
        const deletedMap = {};
        [...cloudDeletedLog, ...localDeletedLog].forEach(e => {
          if (!e || e.id === undefined) return;
          if (!deletedMap[e.id] || e.deletedAt > deletedMap[e.id].deletedAt) deletedMap[e.id] = e;
        });
        const mergedDeletedLog = Object.values(deletedMap);
        const deletedIds = new Set(mergedDeletedLog.map(e => e.id));

        if (cloudRoutines.length === 0 && localRoutines.length > 0) {
          state.routines = localRoutines.filter(r => !deletedIds.has(r.id));
        } else {
          const merged = {};
          cloudRoutines.forEach(r => { merged[r.id] = { ...r }; });
          localRoutines.forEach(r => {
            if (deletedIds.has(r.id) && !merged[r.id]) return; // 已被刪除，且雲端也沒有 → 不要復活
            if (merged[r.id]) {
              merged[r.id].done = merged[r.id].done || r.done;
              merged[r.id].doneDate = merged[r.id].done ? (merged[r.id].doneDate || r.doneDate) : null;
              const cloudTs = merged[r.id].doneTs || 0;
              const localTs = r.doneTs || 0;
              merged[r.id].doneTs = merged[r.id].done ? Math.max(cloudTs, localTs) || null : null;
            } else {
              merged[r.id] = { ...r };
            }
          });
          // 保險：即使雲端裡還留著已標記刪除的項目（例如推送順序競態），一併濾除
          deletedIds.forEach(id => { delete merged[id]; });
          state.routines = Object.values(merged);
          const nameMap = {};
          state.routines.forEach(r => {
            const key = r.name.trim();
            if (!nameMap[key]) { nameMap[key] = r; }
            else {
              const existing = nameMap[key];
              const mergedDone = existing.done || r.done;
              const mergedDoneDate = mergedDone ? (existing.doneDate || r.doneDate) : null;
              const mergedDoneTs = mergedDone ? Math.max(existing.doneTs || 0, r.doneTs || 0) || null : null;
              nameMap[key] = { ...existing, done: mergedDone, doneDate: mergedDoneDate, doneTs: mergedDoneTs };
            }
          });
          state.routines = Object.values(nameMap);
        }
        // 只保留 180 天內的刪除紀錄，避免無限增長
        const _cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
        state.routinesDeletedLog = mergedDeletedLog.filter(e => e.deletedAt >= _cutoff);
      }
      // ── Goal/Energy migration
      const _goalMigMap = { '成長':'技能','技能':'技能','探索':'技能','創作':'自我','關係':'自我','貢獻':'自我','健康':'自我','日常':'日常' };
      state.tasks.forEach(t => { if (t.goal && _goalMigMap[t.goal]) t.goal = _goalMigMap[t.goal]; });
      if (state.doneHistory) state.doneHistory.forEach(h => { if (h.goal && _goalMigMap[h.goal]) h.goal = _goalMigMap[h.goal]; });
      const _energyMigMap = { deep:'focus', flow:'charge', light:'easy', rest:'charge', low:'charge', mid:'easy', high:'focus' };
      state.tasks.forEach(t => { if (t.energy && _energyMigMap[t.energy]) t.energy = _energyMigMap[t.energy]; });
      // ── Restore notes
      _dbg('[notes] data.notes:', data.notes ? 'exists, tabs:' + (data.notes.tabs ? data.notes.tabs.length : 'no tabs') : 'MISSING');
      if (data.notes && data.notes.tabs) {
        const _chosen = _pickNotes(data.notes);
        _dbg('[notes] _chosen:', _chosen ? 'ok, tabs:' + _chosen.tabs.length : 'null');
        if (_chosen) {
          _lsSafeSet('aethelgard_notes_v1', JSON.stringify(_chosen));
          if (typeof window.notesLoadFromData === 'function') {
            _dbg('[notes] calling notesLoadFromData');
            window.notesLoadFromData(_chosen);
            _dbg('[notes] notesLoadFromData done');
          }
        }
      }
      // ── Restore lotteryState
      // ★ Bug fix：翻牌／十連抽也是先寫本地（saveLottery）、debounce 過後才真的推上雲端，
      //   跟 rewards／wishPoints 是同一種競態：這段空窗期重新整理，舊的雲端 lotteryState
      //   會把剛才的 todayFlipped／cards／tickets 蓋回去，等於同一批翻牌機會可以再翻一次。
      //   同樣用 savedAt 比對，本機較新時保留本機的 lotteryState，不被舊雲端資料覆蓋。
      if (data.lotteryState && typeof data.lotteryState === 'object') {
        const localLottery = (function() {
          try { return JSON.parse(localStorage.getItem('aethelgard_lottery') || 'null'); } catch(e) { return null; }
        })();
        const localLotterySavedAt = localLottery && typeof localLottery.savedAt === 'number' ? localLottery.savedAt : 0;
        const cloudLotteryUpdatedAt = typeof data.lotteryState.savedAt === 'number' ? data.lotteryState.savedAt : cloudUpdatedAt;
        const _lotteryIsNewer = isOwnUid && localLottery && localLotterySavedAt > cloudLotteryUpdatedAt
          && _localLotteryHasUnsyncedEdit(localLottery);
        if (_lotteryIsNewer) {
          lotteryState = { ...lotteryState, ...localLottery };
        } else {
          lotteryState = { ...lotteryState, ...data.lotteryState };
        }
        localStorage.setItem('aethelgard_lottery', JSON.stringify(lotteryState));
      }
      // ── 還原設定
      if (data.settings) {
        if (data.settings.resetTime) {
          localStorage.setItem('aethelgard_reset_time', data.settings.resetTime);
          const rtEl = document.getElementById('resetTimeInput');
          if (rtEl) rtEl.value = data.settings.resetTime;
        }
        if (data.settings.neglectDays) {
          localStorage.setItem('aethelgard_neglect_days', data.settings.neglectDays);
          const ndEl = document.getElementById('neglectDaysInput');
          if (ndEl) ndEl.value = data.settings.neglectDays;
        }
      }
      // ★ 這裡代表本機 state 已經確定跟雲端這次讀到的版本對齊了（不管是直接採用
      //   雲端資料，還是因為偵測到本機有真的未同步的變動而保留本機）——記錄下這個
      //   對齊點的內容雜湊，下次讀取時才能正確分辨「本機是否真的有新變動」，
      //   而不是被 saveStateLocal() 每次都重新蓋掉的 savedAt 時間戳誤導。
      _markStateSynced({ tasks: state.tasks, rewards: state.rewards, doneHistory: state.doneHistory, wishPoints: state.wishPoints });
      _markLotterySynced(lotteryState);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Firebase 讀取失敗', e);
  }
  return false;
}

// ── 安全寫入 localStorage（無痕模式 Safari 會拋出 QuotaExceededError）──
function _lsSafeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch(e) { return false; }
}
// ── 選出應採用的 notes 版本（雲端 vs 本地），無論 localStorage 是否可用 ──
// ★ 改版：原本是「整份筆記比一個時間戳，新的整份採用」，代表只要兩台裝置
//   在同步空窗期各自編輯了「不同分頁」，其中一份就會被整份蓋掉、憑空消失。
//   現在改成「以分頁為單位」合併：每個分頁各自比較自己的更新時間，
//   只有兩邊真的動到「同一個分頁」才會取新的那份，其餘分頁互不影響。
//   分頁刪除則用 tombstone（deletedTabIds）標記，避免舊裝置手上留著的
//   已刪除分頁被合併邏輯當成「新分頁」而復活（跟例行任務的邏輯一致）。
function _pickNotes(cloudNotes) {
  if (!cloudNotes || !cloudNotes.tabs) return null;
  try {
    const cloudTs = cloudNotes.updatedAt || 0;
    // ★ Bug 3 fix：只有使用者在本 session 真正編輯過（_notesUserEdited=true）才採信記憶體時間戳
    let localNotes = null;
    const memPayload = window._notesGetSyncPayload && window._notesGetSyncPayload();
    if (memPayload && window._notesUserEdited) {
      localNotes = memPayload;
    } else {
      const localRaw = localStorage.getItem('aethelgard_notes_v1');
      localNotes = localRaw ? JSON.parse(localRaw) : null;
    }
    if (!localNotes || !Array.isArray(localNotes.tabs) || localNotes.tabs.length === 0) return cloudNotes; // 本地無資料 → 用雲端

    const localTs = localNotes.updatedAt || 0;
    const localIsEmpty = localNotes.tabs.every(tab =>
      !tab.pages || tab.pages.every(pg => !pg.a?.trim() && !pg.b?.trim() && !pg.titleA?.trim() && !pg.titleB?.trim())
    );
    if (localIsEmpty) return cloudNotes;

    // ── 合併分頁刪除標記 ──
    const cloudDeleted = Array.isArray(cloudNotes.deletedTabIds) ? cloudNotes.deletedTabIds : [];
    const localDeleted = Array.isArray(localNotes.deletedTabIds) ? localNotes.deletedTabIds : [];
    const mergedDeleted = _notesMergeDeletedLogs(cloudDeleted, localDeleted);
    const deletedIds = new Set(mergedDeleted.map(e => e.id));

    // 分頁比對 key：優先用 id；舊資料若還沒有 id，退而用名稱比對
    const _key = t => t.id || ('name:' + (t.name || '').trim());

    const cloudMap = {}; cloudNotes.tabs.forEach(t => { cloudMap[_key(t)] = t; });
    const localMap = {}; localNotes.tabs.forEach(t => { localMap[_key(t)] = t; });

    function pickTab(key) {
      const c = cloudMap[key], l = localMap[key];
      if (c && !l) return c;
      if (l && !c) return l;
      if (!c && !l) return null;
      // 兩邊都有這個分頁：比各自分頁的 updatedAt（沒有的話退而比整份時間戳）
      const ct = c.updatedAt || cloudTs || 0;
      const lt = l.updatedAt || localTs || 0;
      return lt > ct ? l : c;
    }

    // 排序基準：用整體時間戳較新的那一份的分頁順序當基準，另一份的分頁補在後面
    const baseIsCloud = cloudTs >= localTs;
    const baseTabs  = baseIsCloud ? cloudNotes.tabs : localNotes.tabs;
    const otherTabs = baseIsCloud ? localNotes.tabs : cloudNotes.tabs;

    const seen = new Set();
    const mergedTabs = [];
    [...baseTabs, ...otherTabs].forEach(t => {
      const key = _key(t);
      if (seen.has(key)) return;
      seen.add(key);
      if (t.id && deletedIds.has(t.id)) return; // 已被任一裝置刪除 → 不放回去
      const picked = pickTab(key);
      if (picked) mergedTabs.push(picked);
    });

    if (mergedTabs.length === 0) return cloudNotes; // 保險：合併結果不該是空的，退回雲端版本

    // ★ Bug fix：舊資料沒有 id 時，notesEnsureDefaults() 會在「每一台裝置上各自」
    //   用 _notesGenId() 現場補一個 id。同一個分頁（同名）在兩台裝置上因此拿到
    //   不同的 id，上面用 id 當 key 的合併邏輯就會把它們當成兩個不同分頁，
    //   結果同一個標籤越同步越多份。這裡在合併結果出爐後，用「名稱」再做一次
    //   保險性去重：同名分頁只留一份（挑更新時間較新的那份為主），並把另一份
    //   有內容、主分頁沒有的頁面併進去，避免真的遺失資料。
    const _dedupedTabs = (function() {
      const byName = {};
      const order = [];
      mergedTabs.forEach(t => {
        const key = (t.name || '').trim();
        if (!byName[key]) { byName[key] = []; order.push(key); }
        byName[key].push(t);
      });
      const out = [];
      order.forEach(key => {
        const group = byName[key];
        if (group.length === 1) { out.push(group[0]); return; }
        // 同名多份：挑 updatedAt 最新的當主分頁
        group.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const primary = { ...group[0], pages: [...(group[0].pages || [])] };
        const isBlank = pg => !pg.a?.trim() && !pg.b?.trim() && !pg.titleA?.trim() && !pg.titleB?.trim();
        const sig = pg => [pg.titleA, pg.a, pg.titleB, pg.b].map(s => (s || '').trim()).join('\u0001');
        const existingSigs = new Set(primary.pages.filter(pg => !isBlank(pg)).map(sig));
        group.slice(1).forEach(dup => {
          (dup.pages || []).forEach(pg => {
            if (isBlank(pg)) return;
            const s = sig(pg);
            if (!existingSigs.has(s)) { primary.pages.push(pg); existingSigs.add(s); }
          });
        });
        if (primary.pages.length === 0) primary.pages = [{ titleA:'', a:'', titleB:'', b:'' }];
        out.push(primary);
      });
      if (out.length !== mergedTabs.length) {
        _dbg('[_pickNotes] 偵測到同名重複分頁，已去重合併：', mergedTabs.length, '→', out.length);
      }
      return out;
    })();

    const base = baseIsCloud ? cloudNotes : localNotes;
    const merged = {
      tabs: _dedupedTabs,
      lastTab: base.lastTab || 0,
      lastViewedTab: typeof base.lastViewedTab === 'number' ? base.lastViewedTab : (base.lastTab || 0),
      lastViewedPage: base.lastViewedPage || 0,
      updatedAt: Math.max(cloudTs, localTs),
      deletedTabIds: mergedDeleted
    };
    _dbg('[_pickNotes] 以分頁為單位合併完成，共', mergedTabs.length, '個分頁，cloudTs:', cloudTs, 'localTs:', localTs);
    return merged;
  } catch(e) { return cloudNotes; } // 解析失敗 → 用雲端
}
// ── Notes cloud sync helper — debounced 5s to avoid pushing on every keystroke ──
let _notesSyncTimer = null;
let _notesDirty = false; // 只有筆記真正修改時才標記，避免每次 sync 都帶上全文

function syncNotesToCloud() {
  const nowTs = Date.now();
  // 更新 localStorage 的 updatedAt
  try {
    const raw = localStorage.getItem('aethelgard_notes_v1');
    if (raw) {
      const data = JSON.parse(raw);
      data.updatedAt = nowTs;
      localStorage.setItem('aethelgard_notes_v1', JSON.stringify(data));
    }
  } catch(e) {}
  try {
    if (window._notesGetSyncPayload && window._notesGetSyncPayload()) {
      window._notesMemUpdatedAt = nowTs;
    }
  } catch(e) {}
  _notesDirty = true;

  // ★ 筆記直接寫 Firestore，不走 syncToCloud 的 debounce/hash，防止關頁前遺失
  clearTimeout(_notesSyncTimer);
  _notesSyncTimer = setTimeout(async () => {
    if (!window._fbUid || !window._fbDb) {
      // Firebase 未就緒，降級走 syncToCloud
      syncToCloud();
      return;
    }
    const notesPayload = (function() {
      try {
        const p = window._notesGetSyncPayload && window._notesGetSyncPayload();
        if (p) return p;
      } catch(e) {}
      try {
        const raw = localStorage.getItem('aethelgard_notes_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed;
        }
      } catch(e) {}
      return null;
    })();
    if (!notesPayload) { syncToCloud(); return; }

    try {
      const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
      // ★ 改用已經載入好的 setDoc（merge:true），效果等同 updateDoc 但不用再動態
      //   import 一次 firebase-firestore.js —— 無痕模式下這個 import 要重新走網路，
      //   常常還沒抓完頁面就被 reload/關閉打斷，是筆記遺失的主因之一。
      await window._fbSetDoc(ref, { notes: notesPayload }, { merge: true });
      _notesDirty = false;
      _dbg('[notes] 直接寫入 Firestore 成功');
      const dot = document.getElementById('syncDot');
      if (dot) dot.className = 'sync-dot synced';
    } catch(e) {
      console.warn('[notes] 直接寫入失敗，降級走 syncToCloud', e);
      syncToCloud();
    }
  // ★★ 省額度：debounce 5 秒
  // 停止打字 5 秒後才推送（三個 app 共用免費專案，需節省寫入次數）
  // 關頁/切頁時由 visibilitychange + beforeunload 保底，不怕遺失
  // ★★ 省額度：依裝置調整 debounce
  // 手機（Mobi/Android/iPhone/iPad）：5 秒，觸控編輯短暫，盡快推
  // PC：30 秒，停止打字 30 秒後才推，整個 session 大幅省寫入次數
  // 關頁/切頁時由 visibilitychange + beforeunload 保底，不怕遺失
  }, /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 5000 : 30000);
}

// ── 取得目前筆記的同步 payload（供緊急推送共用）──
function _getNotesPayloadForEmergency() {
  try {
    const p = window._notesGetSyncPayload && window._notesGetSyncPayload();
    if (p) return p;
  } catch(e) {}
  try {
    const raw = localStorage.getItem('aethelgard_notes_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed;
    }
  } catch(e) {}
  return null;
}

// ── 緊急推送筆記（頁面即將隱藏/關閉時共用）──
// ★ 用已載入的 setDoc(merge:true)，不再動態 import firebase-firestore.js。
//   動態 import 是無痕模式下筆記常常遺失的主因之一：無痕分頁沒有模組快取，
//   這個 import 要重新走一次網路，常常還沒抓完就被瀏覽器判定頁面已卸載而中斷，
//   後面的 setDoc 根本沒機會送出。改用已經在記憶體裡的 setDoc，少一次網路來回。
function _pushNotesEmergency(label) {
  if (!_notesDirty) return;
  if (!window._fbUid || !window._fbDb) return;
  clearTimeout(_notesSyncTimer);
  const notesPayload = _getNotesPayloadForEmergency();
  if (!notesPayload) return;
  try {
    const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
    window._fbSetDoc(ref, { notes: notesPayload }, { merge: true })
      .then(() => { _notesDirty = false; _dbg('[notes] ' + label + ' 緊急推送成功'); })
      .catch(e => console.warn('[notes] ' + label + ' 推送失敗', e));
  } catch(e) {
    console.warn('[notes] ' + label + ' 例外', e);
  }
}

// ── 緊急推送任務/獎勵等其他狀態（頁面即將隱藏/關閉時共用）──
function _pushStateEmergency() {
  if (window._fbUid && window._fbDb && typeof state !== 'undefined' && state._initDone
      && typeof _emergencySave === 'function') {
    if (typeof _syncDebounceTimer !== 'undefined' && _syncDebounceTimer !== null) {
      clearTimeout(_syncDebounceTimer);
      _syncDebounceTimer = null;
    }
    _emergencySave();
  }
}

// ★★★ 重要：無痕模式防資料遺失
// 問題背景：
//   - 無痕模式下 localStorage 在分頁關閉後全部清空
//   - visibilitychange / beforeunload 在某些瀏覽器（手機 Chrome、Safari、Firefox）
//     關閉分頁或切到背景時不一定會觸發，或觸發了也不保證裡面的非同步請求跑得完
//   - 原本的 updateDoc 還要動態 import 模組檔案，又多一層不保證完成的網路請求
//
// 解法（四層，任何一層命中都能保住資料）：
//   1. 每次修改後幾秒內已直接寫 Firestore（syncNotesToCloud 的 debounce，任務是立即寫）
//   2. visibilitychange → hidden 時緊急推送（切 tab、鎖螢幕時觸發）
//   3. beforeunload → 緊急推送（多數桌面瀏覽器會保證關頁前執行到這裡）
//   4. pagehide → 緊急推送（手機 Safari / Chrome 對 beforeunload 支援不穩定，
//      但 pagehide 幾乎都會觸發，包含被放進 bfcache 的情況）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _pushStateEmergency();
    _pushNotesEmergency('visibilitychange');
  }
});

window.addEventListener('beforeunload', (e) => {
  _pushStateEmergency();
  _pushNotesEmergency('beforeunload');
  // ★★ 新增：關頁前若還有「確定尚未送達雲端」的變動，跳出瀏覽器原生的離開確認對話框。
  //   背景：_pushStateEmergency() 呼叫的 _fbSave() 是非同步的 fetch/XHR 請求；beforeunload
  //   結束後瀏覽器隨時可能真的把分頁砍掉，這個請求很可能根本來不及跑完就被中止——
  //   這正是「PC 編輯完，過幾天在其他裝置打開又變回沒改過」最常見的真正成因：
  //   使用者當下完全不知道那筆修改其實還卡在半路上，就把分頁關了。
  //   瀏覽器不允許自訂提示文字（會顯示各自的通用字樣），但只要設定 returnValue，
  //   就能逼出「確定要離開這個網站嗎？」的提示，讓使用者有機會多等幾秒再關閉，
  //   而不是靜悄悄地遺失這筆修改。只有在真的有未確認同步完成的變動時才跳出，
  //   避免每次關頁都被打擾。
  try {
    const dot = document.getElementById('syncDot');
    const _hasUnconfirmedChange = isSyncing || (dot && !dot.className.includes('synced'));
    if (_hasUnconfirmedChange) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  } catch(err) {}
});

window.addEventListener('pagehide', () => {
  _pushStateEmergency();
  _pushNotesEmergency('pagehide');
});

// ★★ 新增：網路恢復時主動補推。
//   背景：_doSyncToCloud() 失敗只會在同一個分頁內自動重試最多 3 次（間隔 3/6/9 秒），
//   重試用盡就放棄，靜靜停在「同步失敗」的紅燈狀態，不會再自己動——如果那次失敗
//   剛好是因為斷網（例如搭電梯、進地下室、切換 Wi-Fi），使用者往往完全沒注意到紅燈，
//   之後即使網路恢復了，也不會有任何東西再觸發一次推送，直到使用者剛好又編輯了
//   什麼、或手動點同步燈為止。這裡監聽瀏覽器的 online 事件，網路一恢復就立刻
//   補推一次，縮小「資料卡在本機出不去」的時間窗口。
window.addEventListener('online', () => {
  const dot = document.getElementById('syncDot');
  if (dot && dot.className.includes('error')) {
    _dbg('[sync] 偵測到網路恢復，補推先前失敗的同步');
    _syncRetryCount = 0;
    _doSyncToCloud();
  }
});

// 雲端只同步當年資料，舊資料保留在本地（不會消失）
function archiveOldHistory() {
  if (!state.doneHistory || state.doneHistory.length === 0) return;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = localDateStr(oneYearAgo); // YYYY-MM-DD（本地時區，跟其餘日期比較基準一致；小影響但順手修正）

  const toArchive = state.doneHistory.filter(h => h.completedAt && h.completedAt < cutoff);
  if (toArchive.length === 0) return;

  // 按年分組，存到 aethelgard_history_YYYY
  const byYear = {};
  toArchive.forEach(h => {
    const year = h.completedAt.slice(0, 4);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(h);
  });

  Object.entries(byYear).forEach(([year, entries]) => {
    const key = 'aethelgard_history_' + year;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const existingIds = new Set(existing.map(e => e.id));
      const merged = [...existing, ...entries.filter(e => !existingIds.has(e.id))];
      localStorage.setItem(key, JSON.stringify(merged));
    } catch(e) {
      console.warn('歷史封存失敗（' + year + '）', e);
    }
  });

  // 從 state.doneHistory 移除已封存的項目
  const archivedIds = new Set(toArchive.map(h => h.id));
  state.doneHistory = state.doneHistory.filter(h => !archivedIds.has(h.id));
  saveStateLocal(); // 更新本地備份，不觸發 syncToCloud（封存不需要立即推送）
  _dbg(`已封存 ${toArchive.length} 筆歷史記錄`);
}
window.archiveOldHistory = archiveOldHistory;

// ── Local state persistence (always runs, regardless of cloud) ──
function saveStateLocal() {
  try {
    // ── 安全檢查：初始化完成前不覆蓋（防止 init 尚未完成時蓋掉資料）──
    if (!state._initDone) {
      const existing = localStorage.getItem('aethelgard_state_local');
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          // 只有在 state.tasks 尚未載入（仍是空陣列）時才阻擋
          if (parsed && Array.isArray(parsed.tasks) && parsed.tasks.length > 0 &&
              (!state.tasks || state.tasks.length === 0)) {
            return; // state 還是空的，init 尚未完成，不覆蓋
          }
        } catch(e) {}
      }
    }
    const snapshot = {
      tasks: state.tasks,
      sandbox: state.sandbox,
      done: state.done,
      rewards: state.rewards || [],
      customQuotes: state.customQuotes || [],
      energy: state.energy || 0,
      doneHistory: state.doneHistory || [],
      todayOrder: state.todayOrder || [],
      wishPoints: state.wishPoints || 0,
      morningDialogShownDate: state.morningDialogShownDate || null,
      routines: state.routines || [],
      routineResetDate: state.routineResetDate || null,
      routinesDeletedLog: state.routinesDeletedLog || [],
      savedAt: Date.now()
    };
    localStorage.setItem('aethelgard_state_local', JSON.stringify(snapshot));
  } catch(e) { console.warn('本地備份失敗', e); }
}

// ── Load from localStorage fallback (used when cloud unavailable) ──
function loadStateLocal() {
  try {
    const raw = localStorage.getItem('aethelgard_state_local');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tasks)) return false;
    state.tasks        = data.tasks;
    state.sandbox      = data.sandbox      || [];
    state.done         = data.done         || 0;
    state.rewards      = data.rewards      || [];
    state.customQuotes = data.customQuotes || [];
    state.energy       = data.energy       || 0;
    state.doneHistory  = data.doneHistory  || [];
    state.todayOrder   = data.todayOrder   || [];
    state.wishPoints   = typeof data.wishPoints === 'number' ? data.wishPoints : 0;
    state.morningDialogShownDate = data.morningDialogShownDate || null;
    state.routines     = Array.isArray(data.routines) ? data.routines : [];
    state.routineResetDate = data.routineResetDate || null;
    state.routinesDeletedLog = Array.isArray(data.routinesDeletedLog) ? data.routinesDeletedLog : [];
    return true;
  } catch(e) { return false; }
}

// ── _syncNow：立即同步，跳過 debounce ──
// 用於新增/刪除等一次性操作：確保雲端永遠保留「最新」狀態，
// 不必等 5 秒/30 秒的 debounce 才推送，避免切換裝置時讀到尚未送出的舊資料。
function _syncNow() {
  saveStateLocal();
  if (!state._initDone) return;
  if (!_isFirebaseReady()) return;
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  _markSyncWrite(); // 立即抑制 snapshot，不等 _fbSave() 完成，避免自己剛推的資料被回聲覆蓋
  _doSyncToCloud();
}
window._syncNow = _syncNow;

// ── syncToCloud：對外入口，帶 debounce 防止短時間內連續呼叫造成閃爍 ──
// ★ Optimistic UI：saveStateLocal() 立即執行，UI 永遠不阻塞等待雲端
function syncToCloud() {
  saveStateLocal();
  if (!state._initDone) return;
  if (!_isFirebaseReady()) return;
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  // ★★ 省額度：依裝置調整 debounce（手機 5 秒 / PC 30 秒）
  // 手機：觸控編輯短暫，5 秒後推；PC：停止操作 30 秒後推，省寫入次數
  // 關頁/切頁由 visibilitychange + beforeunload 保底
  _syncDebounceTimer = setTimeout(() => { _syncDebounceTimer = null; _doSyncToCloud(); },
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 5000 : 30000);
}

// ── 組建同步 payload（抽出供緊急推送複用）──
function _buildSyncPayload() {
  const p = {
    tasks: state.tasks,
    sandbox: state.sandbox,
    done: state.done,
    rewards: state.rewards || [],
    customQuotes: state.customQuotes || [],
    energy: state.energy || 0,
    doneHistory: (function() {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const _cutoffStr = localDateStr(oneYearAgo);
      const _filtered = (state.doneHistory || []).filter(h => !h.completedAt || h.completedAt >= _cutoffStr);
      // ★ 緊急止血：近一年篩選在使用量大時仍可能無上限增長，導致整份文件
      // 超過 Firestore 1MB 硬上限、所有同步全面失敗。這裡再加一道「最多保留
      // 最近 800 筆」的安全上限（doneHistory 只影響「軌跡」頁的歷史紀錄顯示，
      // 不影響目前任務/例行任務等核心功能）。
      const _MAX = 800;
      return _filtered.length > _MAX ? _filtered.slice(-_MAX) : _filtered;
    })(),
    todayOrder: state.todayOrder || [],
    lotteryState: lotteryState,
    wishPoints: state.wishPoints || 0,
    morningDialogShownDate: state.morningDialogShownDate || null,
    routines: state.routines || [],
    routineResetDate: state.routineResetDate || null,
    routinesDeletedLog: state.routinesDeletedLog || [],
    settings: { resetTime: localStorage.getItem('aethelgard_reset_time') || '04:00', neglectDays: localStorage.getItem('aethelgard_neglect_days') || '7' },
    updatedAt: Date.now()
  };
  // 帶上 notes
  const _notesPayload = (function(){
    try {
      const n = window._notesGetSyncPayload && window._notesGetSyncPayload();
      if (n) return n;
    } catch(e) {}
    try {
      const raw = localStorage.getItem('aethelgard_notes_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) return parsed;
      }
    } catch(e) {}
    return undefined;
  })();
  if (_notesPayload) p.notes = _notesPayload;
  return p;
}

// ── 緊急推送：繞過 isSyncing 鎖，直接呼叫 _fbSave（用於 beforeunload / visibilitychange）──
function _emergencySave() {
  // ★★★ 重要防呆：雲端初始資料還沒載入完成前，絕對不能推送。
  //   原因：state.tasks 在 loadFromCloud() 完成前是空陣列（剛 init 的預設值）。
  //   _isFirebaseReady() 只檢查 _fbUid/_fbDb 是否存在，並不保證資料已經載入——
  //   如果使用者在這個空窗期切換分頁（觸發 visibilitychange）或關閉分頁
  //   （觸發 beforeunload），_emergencySave() 會把這個「空」的 state 直接寫回雲端，
  //   而所有資料共用同一份 Aethelgard/data 文件，等於把真實資料覆寫成空的。
  //   無痕模式下，匿名登入要走完整網路來回，這個空窗期被拉長，問題更容易被踩到。
  if (typeof state === 'undefined' || !state._initDone) {
    console.warn('[emergencySave] 資料尚未載入完成，跳過推送（避免覆寫雲端資料）');
    return;
  }
  if (!_isFirebaseReady()) return;
  const payload = _buildSyncPayload();
  const hash = _quickHash(payload);
  if (hash && hash === _lastSyncHash) return; // 資料沒變，不推
  _dbg('[emergencySave] 緊急推送 tasks:', payload.tasks.length, 'wishPoints:', payload.wishPoints);
  _fbSave(payload).then(ok => {
    if (ok) { _lastSyncHash = hash; _dbg('[emergencySave] 成功'); }
    else console.warn('[emergencySave] 失敗');
  }).catch(e => console.warn('[emergencySave] 例外', e));
}
window._emergencySave = _emergencySave;

async function _doSyncToCloud() {
  // ★ 同樣的防呆也套用在一般同步上，理由跟 _emergencySave 一致。
  if (typeof state === 'undefined' || !state._initDone) {
    console.warn('[sync] 資料尚未載入完成，跳過推送（避免覆寫雲端資料）');
    return;
  }
  if (!_isFirebaseReady()) return;
  if (isSyncing) { _pendingSync = true; return; }
  if (_syncRetryTimer !== null) { clearTimeout(_syncRetryTimer); _syncRetryTimer = null; }

  // ★ 先組出 payload，做 hash 比對，相同就靜默跳過（不發請求）
  const _payload = _buildSyncPayload();
  _dbg('[sync] notes payload:', _payload.notes ? 'ok updatedAt=' + _payload.notes.updatedAt : 'MISSING');

  // ★ Hash 防重：資料未變動就靜默跳過，不耗費任何網路
  const _hash = _quickHash(_payload);
  if (_hash && _hash === _lastSyncHash) {
    const dot = document.getElementById('syncDot');
    if (dot && dot.className !== 'sync-dot synced') dot.className = 'sync-dot synced';
    return;
  }

  isSyncing = true;
  _pendingSync = false;
  let _retryScheduled = false;
  const dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot syncing';
  try {
    const ok = await _fbSave(_payload);
    if (!ok) throw new Error('Firebase save failed');
    _markSyncWrite(); // ★ 告知 snapshot 監聽器：接下來 2 秒的更新是自己寫的，忽略
    _lastSyncHash = _hash;
    // ★ 推送成功代表雲端現在跟這份 payload 內容一致，記錄對齊點，
    //   避免下次啟動時 saveStateLocal() 重新蓋出的 savedAt 被誤判成「本機有新變動」
    _markStateSynced({ tasks: _payload.tasks, rewards: _payload.rewards, doneHistory: _payload.doneHistory, wishPoints: _payload.wishPoints });
    _markLotterySynced(_payload.lotteryState);
    if (dot) dot.className = 'sync-dot synced';
    _syncRetryCount = 0;
    _notesDirty = false;
  } catch (e) {
    console.warn('雲端儲存失敗', e);
    if (dot) dot.className = 'sync-dot error';
    if (_syncRetryCount < 3) {
      _syncRetryCount++;
      _retryScheduled = true;
      const delay = _syncRetryCount * 3000;
      // 先解鎖才排 timer，timer 執行時重新取鎖
      isSyncing = false;
      _syncRetryTimer = setTimeout(() => { _syncRetryTimer = null; _doSyncToCloud(); }, delay);
    }
    // ── Bug fix：_syncRetryCount >= 3 時不排 retry，但原本沒有釋放 isSyncing
    // → 修正：確保此分支也釋放鎖，否則燈號永久閃爍且任何後續操作都無法同步 ──
    // （isSyncing 釋放移到 finally 統一處理，_retryScheduled 為 false 時自動釋放）
  } finally {
    // 只有沒有安排 retry 時才在這裡做收尾（含超過重試上限的失敗情境）
    if (!_retryScheduled) {
      isSyncing = false;
      if (_pendingSync) { _pendingSync = false; _doSyncToCloud(); }
    }
  }
}
