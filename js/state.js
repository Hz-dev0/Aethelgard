// ── 目標 / 能量循環切換 ────────────────────────────────────
const _goalCycle  = [
  { key:'技能', label:'🚩 限時活動' },
  { key:'自我', label:'💎 突破素材' },
  { key:'日常', label:'🧭 每日委託' },
];

// 分類 key（技能/自我/日常）→ 顯示用 label 的共用查表。
// 任何要把分類「印給人看」的地方都應該呼叫這個，而不是直接印 key，
// 否則改了 treeNodes/_goalCycle 的 label 之後，這些地方還是會顯示舊的內部代號。
function goalLabel(key) {
  if (typeof treeNodes !== 'undefined' && treeNodes.length) {
    const n = treeNodes.find(x => x.key === key);
    if (n) return n.label;
  }
  const g = _goalCycle.find(x => x.key === key);
  if (g) return g.label.replace(/^\S+\s*/, ''); // 去掉 _goalCycle label 開頭的 emoji，只取文字
  return key || '';
}
window.goalLabel = goalLabel;
const _energyCycle = [
  { key:'easy',   label:'🍃 輕鬆' },
  { key:'focus',  label:'𖦏 專注' },
  { key:'charge', label:'⚡ 充電' },
];

// ── 目標 / 能量循環切換結束 ─────────────────────────────────

// ── 即時滿足 (Instant Reward) ─────────────────────────────

function pickSandboxForName(prefix) {
  if (!state.sandbox || state.sandbox.length === 0) {
    showToast('沙盒裡還沒有項目，先去新增吧！');
    return;
  }
  const items = state.sandbox;
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:10020;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:6px 0;box-shadow:0 8px 28px rgba(58,110,165,0.18);min-width:200px;max-width:300px;max-height:260px;overflow-y:auto;animation:modalIn 0.15s ease';
  items.forEach((s, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:9px 16px;font-size:13px;color:var(--text);cursor:pointer;transition:background 0.12s';
    div.textContent = typeof s === 'string' ? s : s.text;
    div.addEventListener('mouseover', () => { div.style.background = 'rgba(201,162,39,0.08)'; });
    div.addEventListener('mouseout',  () => { div.style.background = ''; });
    div.addEventListener('click', () => selectSandboxForName(i, prefix, menu));
    menu.appendChild(div);
  });
  document.body.appendChild(menu);
  const btn = document.getElementById(prefix + 'TaskName');
  if (btn) {
    const r = btn.getBoundingClientRect();
    let top = r.bottom + 6, left = r.left;
    if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 50);
}
window.pickSandboxForName = pickSandboxForName;

function selectSandboxForName(idx, prefix, menuEl) {
  const s = state.sandbox[idx];
  const text = typeof s === 'string' ? s : s.text;
  const input = document.getElementById(prefix + 'TaskName');
  if (input) input.value = text;
  window._pendingSandboxRemoveName = window._pendingSandboxRemoveName || {};
  window._pendingSandboxRemoveName[prefix] = idx;
  if (menuEl) menuEl.remove();
}
window.selectSandboxForName = selectSandboxForName;

function overlay_navigateToTask(id, el) {
  const overlay = el.closest('[style*=inset]');
  if (overlay) overlay.remove();
  navigateToTask(id);
}
window.overlay_navigateToTask = overlay_navigateToTask;

// ── 即時滿足結束 ──────────────────────────────────────────

// ── Manual sync on syncDot click ──
async function syncDotClicked() {
  const url = getApiUrl();
  // Firebase 模式下沒有 API URL，直接手動同步；無任何連線才開設定
  if (!url && !window._fbUid) { openApiModal(); return; }
  // ★ 防呆：雲端初始資料還沒完整載入完成前，絕對不能手動推送。
  //   原因：state._initDone 是「state.tasks/routines 已確定是完整雲端資料」的唯一標記；
  //   若在這之前手動按同步，_buildSyncPayload() 組出來的可能是不完整/空的 state，
  //   一旦推送就會覆蓋雲端唯一的共用文件，害其他裝置的資料被清空
  //   （無痕模式下這個「還沒載完」的空窗期特別長，最容易踩到）。
  //   這裡明確告知使用者，而不是靜靜地什麼都不做或冒險推送。
  if (typeof state === 'undefined' || !state._initDone) {
    if (typeof showToast === 'function') showToast('⏳ 資料尚未載入完成，請稍候再試一次');
    return;
  }
  // 清除所有 pending timer，強制立即同步
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  if (_syncRetryTimer !== null) { clearTimeout(_syncRetryTimer); _syncRetryTimer = null; }
  isSyncing = false;
  _pendingSync = false;
  _syncRetryCount = 0;
  _notesDirty = true; // 手動同步強制帶上 notes，確保完整推送
  _markSyncWrite(); // 先抑制 snapshot，避免推送中途被舊資料覆蓋
  if (typeof showToast === 'function') showToast('☁️ 同步中…');
  const dot = document.getElementById('syncDot');
  // 直接執行並等待結果，讓 toast 反映最終狀態
  await _doSyncToCloud();
  // 根據燈號狀態給出明確回饋
  if (dot && dot.classList.contains('synced')) {
    if (typeof showToast === 'function') showToast('✓ 同步成功');
  } else if (dot && dot.classList.contains('error')) {
    if (typeof showToast === 'function') showToast('❌ 同步失敗，請稍後再試');
  }
}
window.syncDotClicked = syncDotClicked;

// ── 強制同步筆記到 Firestore ──
async function forceSyncNotes() {
  const statusEl = document.getElementById('notesSyncStatus');
  if (!window._fbUid || !window._fbDb) {
    if (statusEl) statusEl.textContent = '❌ 尚未連線 Firebase';
    return;
  }
  const notesPayload = window._notesGetSyncPayload && window._notesGetSyncPayload();
  if (!notesPayload) {
    if (statusEl) statusEl.textContent = '❌ 筆記尚未載入或無資料';
    return;
  }
  if (statusEl) statusEl.textContent = '同步中…';
  try {
    const ref = window._fbDoc(window._fbDb, 'Aethelgard', 'data');
    // 使用 setDoc merge 方式更新 notes 欄位
    const { getFirestore, doc: fDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(ref, { notes: notesPayload });
    if (statusEl) statusEl.textContent = '✓ 筆記已推送至雲端！tabs: ' + notesPayload.tabs.length;
    showToast('✓ 筆記已同步');
  } catch(e) {
    if (statusEl) statusEl.textContent = '❌ 同步失敗：' + e.message;
  }
}
window.forceSyncNotes = forceSyncNotes;

// ── State ──
let state = {
  tasks: [],
  sandbox: [],
  rewards: [],
  customQuotes: [],
  energy: 0,
  energyFilter: 'all',
  taskTypeFilter: 'all',
  timeFilter: 'all',
  goalFilter: null,
  postponeTarget: null,
  done: 0,
  doneOpen: false,
  pendingClaimId: null,
  doneHistory: [], // archive of completed tasks after reset
  todayOrder: [], // ordered task ids for the today panel
  wishPoints: 0,  // 願望碎片：完成核心任務或日常任務可獲得，可分配給許願池
  morningDialogShownDate: null, // YYYY-MM-DD：當天已顯示過早晨重複任務視窗
  routines: [],        // 例行任務清單 [{ id, name, done, doneDate }]
  routineResetDate: null, // YYYY-MM-DD：最後一次重置例行任務的日期（跨裝置同步）
  routinesDeletedLog: [], // 例行任務刪除紀錄（tombstone）[{ id, deletedAt }]，避免合併時被復活
};

// ── 統一渲染入口 ──
// 同一個 tick 內多次呼叫只會執行一次，避免連鎖操作重複刷新 DOM
let _renderAllTimer = null;
function renderAll() {
  if (_renderAllTimer) return;
  _renderAllTimer = setTimeout(() => {
    _renderAllTimer = null;
    renderTree();
    renderTasks();
    renderTodayPanel();
    renderStats();
    renderRewards();
    renderLottery();
    renderRoutineList();
  }, 0);
}

// ── checkTaskDates 定時器（App 開著跨日時自動觸發）──
let _checkTaskDatesTimer = null;

const energyLabels = { charge: '充電', easy: '輕鬆', focus: '專注' };
const energyIcons  = { charge: '⚡', easy: '🍃', focus: '𖦏' };
