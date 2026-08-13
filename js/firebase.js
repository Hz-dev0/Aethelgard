// ── HTML escape utility (prevents XSS) ──
function escHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ── Cloud API — Firebase Firestore ──
// UID 由匿名登入自動取得，存在 window._fbUid
// 舊版 GAS 相關 key 保留名稱以防萬一，但實際不再使用
const API_STORAGE_KEY = 'aethelgard_api_url';
const API_KEY_FRAGMENT_STORE = 'aethelgard_api_fragment';

function getApiUrl() { return ''; }
function _isFirebaseReady() { return !!(window._fbUid && window._fbDb); }

// ── Firebase Firestore 讀寫 helpers ──
async function _fbLoad() {
  if (!window._fbUid || !window._fbDb) {
    console.warn('[_fbLoad] 尚未就緒 uid:', window._fbUid, 'db:', !!window._fbDb);
    return null;
  }
  try {
    const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
    const snap = await window._fbGetDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      console.log('[_fbLoad] 成功，tasks數量:', d && d.tasks ? d.tasks.length : 'none');
      return d;
    }
    console.log('[_fbLoad] 新用戶，尚無雲端資料，uid:', window._fbUid);
    return null;
  } catch(e) {
    console.warn('[_fbLoad] 讀取失敗:', e.code, e.message);
    return null;
  }
}

function _stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(_stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) { out[k] = obj[k] === undefined ? null : _stripUndefined(obj[k]); }
    return out;
  }
  return obj;
}

async function _fbSave(payload) {
  if (!window._fbUid || !window._fbDb) return false;
  try {
    const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
    // ★ 使用 merge:true，避免任務同步時意外覆蓋掉 notes 等其他欄位
    await window._fbSetDoc(ref, _stripUndefined(payload), { merge: true });
    return true;
  } catch(e) {
    console.warn('Firebase 寫入失敗', e);
    // ★ 體檢報表：如果是「文件大小超過上限」造成的失敗，把每個欄位各佔多少
    // bytes 印出來，方便一眼找出是哪個欄位把文件撐爆的（而不用用猜的）。
    if (String(e && e.message || e).includes('exceeds the maximum allowed size')) {
      try {
        const _sizeOf = v => new Blob([JSON.stringify(v ?? null)]).size;
        const _rows = Object.keys(payload).map(k => ({ 欄位: k, 大小_bytes: _sizeOf(payload[k]) }))
          .sort((a, b) => b.大小_bytes - a.大小_bytes);
        console.warn('📋 [同步體檢] 文件已超過 Firestore 1MB 上限，各欄位大小明細（由大到小）：');
        console.table(_rows);
        console.warn('📋 [同步體檢] 加總：', _rows.reduce((s, r) => s + r.大小_bytes, 0), 'bytes（1MB = 1,048,576 bytes）');
      } catch(e2) { console.warn('[同步體檢] 計算失敗', e2); }
    }
    return false;
  }
}

// ── 即時監聽（onSnapshot）：其他裝置修改後自動更新本裝置 ──
let _fbUnsubscribe = null;      // 用來取消舊的監聽
let _snapshotIgnoreUntil = 0;   // 自己剛寫入後短暫忽略，避免觸發自我更新

function _startRealtimeListener(uid) {
  // 先取消舊的監聽（UID 切換時重新綁定）
  if (_fbUnsubscribe) { _fbUnsubscribe(); _fbUnsubscribe = null; }
  if (!window._fbOnSnapshot || !window._fbDb) return;

  const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
  _fbUnsubscribe = window._fbOnSnapshot(ref, (snap) => {
    // 1. 尚未初始化完成前不處理（init() 自己會讀一次）
    console.log('[snapshot] 收到推送 _initDone:', state._initDone, 'ignoreUntil:', _snapshotIgnoreUntil, 'now:', Date.now(), 'exists:', snap.exists());
    if (!state._initDone) { console.log('[snapshot] ❌ _initDone=false，略過'); return; }
    // 2. 若是自己剛寫入觸發的 snapshot，忽略（避免自我迴圈）
    if (Date.now() < _snapshotIgnoreUntil) { console.log('[snapshot] ❌ 在忽略視窗內（自己寫的），略過'); return; }
    // 3. 沒資料就略過
    if (!snap.exists()) { console.log('[snapshot] ❌ snap 不存在'); return; }

    const data = snap.data();
    if (!data || !Array.isArray(data.tasks)) { console.log('[snapshot] ❌ data 無效', data); return; }

    // 4. 用完整 tasks 比對，確保任何欄位變動都能偵測到
    function _taskFingerprint(tasks) {
      if (!Array.isArray(tasks)) return '';
      const sorted = [...tasks].sort((a, b) => Number(a.id) - Number(b.id));
      return JSON.stringify(sorted.map(t => ({
        id: t.id, done: !!t.done, name: t.name,
        completedAt: t.completedAt || null,
        scheduledFor: t.scheduledFor || null,
        status: t.status || null,
        // ★ Bug fix：原本只比對上面 6 個欄位，導致只改「分類/精力/心得/備忘/日期/重複設定」
        // 等欄位時，兩端指紋看起來完全一致 → 即時監聽誤判「沒有變化」而直接跳過，
        // 使得該次更新只能靠使用者手動重新整理（走 loadFromCloud）才會出現，
        // 即時同步等於沒生效。這裡把所有會被使用者編輯的欄位都納入比對。
        goal: t.goal || null,
        energy: t.energy || null,
        meaning: t.meaning || null,
        note: t.note || null,
        reward: t.reward || null,
        taskDate: t.taskDate || null,
        recurring: !!t.recurring,
        recurMode: t.recurMode || null,
        recurInterval: t.recurInterval || 0,
        postponed: t.postponed || 0
      })));
    }
    const remoteFingerprint = _taskFingerprint(data.tasks);
    const localFingerprint  = _taskFingerprint(state.tasks);
    console.log('[snapshot] remote tasks:', data.tasks.length, 'local tasks:', state.tasks.length);
    console.log('[snapshot] fingerprint 相同?', remoteFingerprint === localFingerprint);
    // ★ Bug 1 fix：也比對筆記 updatedAt，避免「只改筆記」時被誤判為資料一致而跳過
    const remoteNotesTs = (data.notes && data.notes.updatedAt) || 0;
    const localNotesTs = (() => {
      try {
        const memTs = window._notesMemUpdatedAt || 0;
        const lsRaw = localStorage.getItem('aethelgard_notes_v1');
        const lsTs = lsRaw ? (JSON.parse(lsRaw).updatedAt || 0) : 0;
        return Math.max(memTs, lsTs);
      } catch(e) { return 0; }
    })();
    const notesUnchanged = remoteNotesTs <= localNotesTs;
    // ★ 也比對 routines（例行任務完成狀態），避免只改 routines/wishPoints 時被誤判為一致
    const remoteRoutinesStr = JSON.stringify((data.routines || []).map(r => ({ id: r.id, done: !!r.done, doneDate: r.doneDate || null })).sort((a,b) => a.id - b.id));
    const localRoutinesStr  = JSON.stringify((state.routines || []).map(r => ({ id: r.id, done: !!r.done, doneDate: r.doneDate || null })).sort((a,b) => a.id - b.id));
    const routinesUnchanged = remoteRoutinesStr === localRoutinesStr;
    // ★ Bug fix：sandbox（靈感沙盒）/rewards（許願池）/customQuotes（自訂格言）原本完全沒被比對，
    // 只改這幾項、但 tasks/done/wishPoints/notes/routines 剛好沒變時，即時監聽會誤判一致而跳過，
    // 導致這幾項的變更要等重新整理（走 loadFromCloud）才會出現在其他裝置上。
    const remoteSandboxStr = JSON.stringify(data.sandbox || []);
    const localSandboxStr  = JSON.stringify(state.sandbox || []);
    const sandboxUnchanged = remoteSandboxStr === localSandboxStr;
    const remoteRewardsStr = JSON.stringify((data.rewards || []).map(r => ({ id: r.id, name: r.name, count: r.count, allocatedPoints: r.allocatedPoints || 0 })).sort((a,b) => a.id - b.id));
    const localRewardsStr  = JSON.stringify((state.rewards || []).map(r => ({ id: r.id, name: r.name, count: r.count, allocatedPoints: r.allocatedPoints || 0 })).sort((a,b) => a.id - b.id));
    const rewardsUnchanged = remoteRewardsStr === localRewardsStr;
    const remoteQuotesStr = JSON.stringify(data.customQuotes || []);
    const localQuotesStr  = JSON.stringify(state.customQuotes || []);
    const quotesUnchanged = remoteQuotesStr === localQuotesStr;
    if (remoteFingerprint === localFingerprint && data.done === state.done && data.wishPoints === state.wishPoints && notesUnchanged && routinesUnchanged && sandboxUnchanged && rewardsUnchanged && quotesUnchanged) { console.log('[snapshot] ❌ 資料一致（含筆記＋例行任務＋沙盒＋許願池＋格言），略過'); return; }
    if (!notesUnchanged) console.log('[snapshot] 筆記有更新 remote:', remoteNotesTs, 'local:', localNotesTs);

    console.log('[snapshot] ✅ 套用遠端資料');
    const dot = document.getElementById('syncDot');
    if (dot) dot.className = 'sync-dot syncing';

    // ★ Bug fix：即時監聽收到的推送不保證比本機新——如果另一個裝置留著舊分頁在
    //   背景，之後才被喚醒推了一次舊資料上去，這裡若無條件套用，會把「剛完成的
    //   任務」這種本機較新的變動蓋回舊狀態（症狀：任務從清單消失，但因為寫入
    //   順序關係 doneHistory 可能還留著紀錄，兩邊對不起來）。
    //   比照 loadFromCloud 的作法：用本機快照 savedAt 跟遠端 updatedAt 比較，
    //   本機較新時，tasks／doneHistory 保留本機版本，不被舊的遠端資料覆蓋。
    const _localBackupForSnap = (function() {
      try { return JSON.parse(localStorage.getItem('aethelgard_state_local') || 'null'); } catch(e) { return null; }
    })();
    const _cloudUpdatedAtForSnap = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
    const _localSavedAtForSnap = _localBackupForSnap && typeof _localBackupForSnap.savedAt === 'number' ? _localBackupForSnap.savedAt : 0;
    // ★ Bug fix：原本只比 savedAt vs updatedAt，但 saveStateLocal() 幾乎每次操作
    //   都會把 savedAt 蓋成「現在」，跟內容有沒有真的變動無關——這會讓「本機比較新」
    //   幾乎永遠成立，導致即時監聽把剛從其他裝置/剛完成任務推上來的新資料，誤判成
    //   「遠端是舊的」而用本機過時的 tasks/doneHistory 蓋掉，還會反推回雲端，
    //   造成「剛完成的任務又跑回來、成長軌跡歷史消失」。
    //   比照 loadFromCloud() 已經修過的做法：加上內容雜湊比對，確認本機真的有
    //   還沒同步的變動，才判定遠端資料是過時的。
    const _localCoreFieldsForSnap = _localBackupForSnap ? {
      tasks: _localBackupForSnap.tasks, rewards: _localBackupForSnap.rewards,
      doneHistory: _localBackupForSnap.doneHistory, wishPoints: _localBackupForSnap.wishPoints
    } : null;
    const _remoteIsStale = _localSavedAtForSnap > 0 && _cloudUpdatedAtForSnap > 0 && _localSavedAtForSnap > _cloudUpdatedAtForSnap
      && (!_localCoreFieldsForSnap || (typeof _localHasUnsyncedEdit !== 'function' || _localHasUnsyncedEdit(_localCoreFieldsForSnap)));
    if (_remoteIsStale) console.log('[snapshot] ⚠️ 遠端資料比本機舊（本機 savedAt:', _localSavedAtForSnap, '> 遠端 updatedAt:', _cloudUpdatedAtForSnap, '），tasks/doneHistory 保留本機版本');

    // 5. 套用遠端資料到 state（複用 loadFromCloud 的欄位映射邏輯）
    state.tasks        = (_remoteIsStale && Array.isArray(_localBackupForSnap.tasks)) ? _localBackupForSnap.tasks : (data.tasks || []);
    state.sandbox      = data.sandbox      || [];
    state.done         = data.done         || 0;
    state.rewards      = data.rewards      || [];
    state.customQuotes = data.customQuotes || [];
    state.energy       = data.energy       || 0;
    state.doneHistory  = (_remoteIsStale && Array.isArray(_localBackupForSnap.doneHistory)) ? _localBackupForSnap.doneHistory : (data.doneHistory || []);
    state.todayOrder   = data.todayOrder   || [];
    state.wishPoints   = typeof data.wishPoints === 'number' ? data.wishPoints : (state.wishPoints || 0);
    state.routines     = Array.isArray(data.routines) ? data.routines : state.routines;
    state.routineResetDate = data.routineResetDate || state.routineResetDate || null;
    // ★ 即時監聽也要更新 tombstone（刪除標記）清單，跟本機的合併，
    //   確保之後 loadFromCloud() 做合併判斷時，用的是最新的刪除紀錄，
    //   不會誤把別的裝置剛刪除的例行任務又復活。
    {
      const _cloudLog = Array.isArray(data.routinesDeletedLog) ? data.routinesDeletedLog : [];
      const _localLog = Array.isArray(state.routinesDeletedLog) ? state.routinesDeletedLog : [];
      const _map = {};
      [..._cloudLog, ..._localLog].forEach(e => {
        if (!e || e.id === undefined) return;
        if (!_map[e.id] || e.deletedAt > _map[e.id].deletedAt) _map[e.id] = e;
      });
      state.routinesDeletedLog = Object.values(_map);
    }
    if (data.lotteryState && typeof data.lotteryState === 'object') {
      lotteryState = { ...lotteryState, ...data.lotteryState };
      localStorage.setItem('aethelgard_lottery', JSON.stringify(lotteryState));
    }
    // 筆記：只在遠端版本較新時才覆蓋（避免蓋掉本裝置正在編輯的內容）
    if (data.notes && data.notes.tabs) {
      const chosen = _pickNotes(data.notes);
      if (chosen) {
        _lsSafeSet('aethelgard_notes_v1', JSON.stringify(chosen));
        if (typeof notesLoadFromData === 'function') notesLoadFromData(chosen);
      }
    }

    saveStateLocal();
    // ★ 跟 loadFromCloud() 一樣，套用完後記錄這次對齊點的雜湊，
    //   避免下次 snapshot 進來時，_localHasUnsyncedEdit() 誤判本機有新變動。
    if (typeof _markStateSynced === 'function') {
      _markStateSynced({ tasks: state.tasks, rewards: state.rewards, doneHistory: state.doneHistory, wishPoints: state.wishPoints });
    }
    // 更新 hash，讓下一次 syncToCloud 不會把剛收到的資料重新推回去
    _lastSyncHash = _quickHash({
      tasks: state.tasks, sandbox: state.sandbox, done: state.done,
      rewards: state.rewards || [], customQuotes: state.customQuotes || [],
      energy: state.energy || 0,
      doneHistory: (state.doneHistory || []).filter(h => {
        if (!h.completedAt) return true;
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return h.completedAt >= localDateStr(oneYearAgo);
      }),
      todayOrder: state.todayOrder || [], lotteryState,
      wishPoints: state.wishPoints || 0,
      morningDialogShownDate: state.morningDialogShownDate || null,
      routines: state.routines || [], routineResetDate: state.routineResetDate || null,
      routinesDeletedLog: state.routinesDeletedLog || [],
      settings: { resetTime: localStorage.getItem('aethelgard_reset_time') || '04:00', neglectDays: localStorage.getItem('aethelgard_neglect_days') || '7' }
    });

    renderEnergyDots(); renderSandbox(); renderAll(); initRoutines();
    // ★ Fix：雲端推送後需重新檢查排定日期任務，確保幾天前設定「今天」的任務自動排入今日面板
    checkTaskDates();
    if (dot) dot.className = 'sync-dot synced';
    // ★ Fix：訪客模式下 snapshot 可能比 loadFromCloud 更早拿到資料，
    //   此時 closeOwnerLoginOverlay 尚未被 init() 呼叫，需在這裡主動關閉載入遮罩。
    if (typeof closeOwnerLoginOverlay === 'function') closeOwnerLoginOverlay();
    if (_remoteIsStale) {
      // 遠端剛剛蓋成舊資料，這裡把修正後（保留本機較新版本）的狀態立刻推回去，
      // 避免雲端／其他裝置停留在被舊分頁誤蓋掉的狀態。
      if (typeof _syncNow === 'function') _syncNow();
    } else {
      showToast('🔄 已同步其他裝置的更新');
    }
  }, (err) => {
    console.warn('[realtime] 監聽錯誤:', err.code, err.message);
  });
}

// syncToCloud 寫入時，短暫標記「忽略接下來的 snapshot」避免自我觸發
function _markSyncWrite() {
  // 忽略視窗需大於最長 debounce（PC 30s）+ 網路延遲緩衝，避免自己的寫入還沒到 Firebase
  // 就被 snapshot 用舊資料覆蓋（導致勾選後任務「回來」的根本原因）
  _snapshotIgnoreUntil = Date.now() + 35000;
}
