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

function cycleGoal() {
  const cur = document.getElementById('newTaskGoal').value;
  const idx = _goalCycle.findIndex(g => g.key === cur);
  const next = _goalCycle[(idx + 1) % _goalCycle.length];
  document.getElementById('newTaskGoal').value = next.key;
  document.getElementById('newGoalBtn').textContent = next.label;
}

function cycleEnergy() {
  const cur = document.getElementById('newTaskEnergy').value;
  const idx = _energyCycle.findIndex(e => e.key === cur);
  const next = _energyCycle[(idx + 1) % _energyCycle.length];
  document.getElementById('newTaskEnergy').value = next.key;
  document.getElementById('newEnergyBtn').textContent = next.label;
  // Show/hide reward field
  const wrap = document.getElementById('newRewardWrap');
  if (wrap) wrap.style.display = next.key === 'charge' ? 'block' : 'none';
}

function _setGoalBtn(key) {
  const g = _goalCycle.find(x => x.key === key) || _goalCycle[0];
  const btn = document.getElementById('newTaskGoal');
  const lbl = document.getElementById('newGoalBtn');
  if (btn) btn.value = g.key;
  if (lbl) lbl.textContent = g.label;
}

function _setEnergyBtn(key) {
  const e = _energyCycle.find(x => x.key === key) || _energyCycle[0];
  const btn = document.getElementById('newTaskEnergy');
  const lbl = document.getElementById('newEnergyBtn');
  if (btn) btn.value = e.key;
  if (lbl) lbl.textContent = e.label;
  const wrap = document.getElementById('newRewardWrap');
  if (wrap) wrap.style.display = e.key === 'charge' ? 'block' : 'none';
}
function cycleEditGoal() {
  const cur = document.getElementById('editTaskGoal').value;
  const idx = _goalCycle.findIndex(g => g.key === cur);
  const next = _goalCycle[(idx + 1) % _goalCycle.length];
  document.getElementById('editTaskGoal').value = next.key;
  document.getElementById('editGoalBtn').textContent = next.label;
}

function cycleEditEnergy() {
  const cur = document.getElementById('editTaskEnergy').value;
  const idx = _energyCycle.findIndex(e => e.key === cur);
  const next = _energyCycle[(idx + 1) % _energyCycle.length];
  document.getElementById('editTaskEnergy').value = next.key;
  document.getElementById('editEnergyBtn').textContent = next.label;
  // Show/hide reward field
  const wrap = document.getElementById('editRewardWrap');
  if (wrap) wrap.style.display = next.key === 'charge' ? 'block' : 'none';
}

function _setEditGoalBtn(key) {
  const g = _goalCycle.find(x => x.key === key) || _goalCycle[0];
  const hidden = document.getElementById('editTaskGoal');
  const lbl = document.getElementById('editGoalBtn');
  if (hidden) hidden.value = g.key;
  if (lbl) lbl.textContent = g.label;
}

function _setEditEnergyBtn(key) {
  const e = _energyCycle.find(x => x.key === key) || _energyCycle[0];
  const hidden = document.getElementById('editTaskEnergy');
  const lbl = document.getElementById('editEnergyBtn');
  if (hidden) hidden.value = e.key;
  if (lbl) lbl.textContent = e.label;
  const wrap = document.getElementById('editRewardWrap');
  if (wrap) wrap.style.display = e.key === 'charge' ? 'block' : 'none';
}

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

function selectSandboxItem(idx, prefix, menuEl) {
  const s = state.sandbox[idx];
  const text = typeof s === 'string' ? s : s.text;
  const input = document.getElementById(prefix + 'TaskReward');
  if (input) input.value = text;
  // Mark sandbox item to be removed when task is saved
  window._pendingSandboxRemove = window._pendingSandboxRemove || {};
  window._pendingSandboxRemove[prefix] = idx;
  if (menuEl) menuEl.remove();
}

function showInstantWants() {
  const rewards = state.tasks
    .filter(t => !t.done && t.reward && t.reward.trim())
    .map(t => ({ id: t.id, name: t.name, reward: t.reward }));
  if (rewards.length === 0) {
    showToast('還沒有設定即時滿足的任務～先完成任務再來看吧');
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(224,234,244,0.78);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;animation:modalIn 0.2s ease';
  overlay.innerHTML = `<div style="background:var(--bg2);border:1px solid rgba(74,130,196,0.25);border-radius:16px;padding:24px;width:340px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(74,130,196,0.15)">
    <div style="font-family:'DM Serif Display',serif;font-size:18px;margin-bottom:16px;color:var(--text)">妳現在想要…？</div>
    ${rewards.map(r => `<div onclick="overlay_navigateToTask(${r.id}, this)" class="instant-want-item">
      <div style="font-size:11px;color:var(--text-faint);margin-bottom:3px">${escHtml(r.name)} <span style="font-size:10px;opacity:0.6">→ 點擊跳轉</span></div>
      <div style="font-size:14px;color:var(--text);font-weight:500">⚡ ${escHtml(r.reward)}</div>
    </div>`).join('')}
    <button onclick="this.closest('[style*=inset]').remove()" style="margin-top:8px;width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-dim);cursor:pointer;font-family:inherit;font-size:13px">關閉</button>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function overlay_navigateToTask(id, el) {
  const overlay = el.closest('[style*=inset]');
  if (overlay) overlay.remove();
  navigateToTask(id);
}
window.overlay_navigateToTask = overlay_navigateToTask;

function showInstantRewardPopup(reward) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(224,234,244,0.6);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;animation:modalIn 0.2s ease';
  overlay.innerHTML = `<div style="background:var(--bg2);border:2px solid rgba(201,162,39,0.5);border-radius:16px;padding:28px 24px;width:320px;max-width:90vw;text-align:center;box-shadow:0 20px 60px rgba(201,162,39,0.18)">
    <div style="font-size:28px;margin-bottom:10px">⚡</div>
    <div style="font-family:'DM Serif Display',serif;font-size:16px;color:var(--text);margin-bottom:6px">任務完成！</div>
    <div style="font-size:18px;font-weight:600;color:#C9A227;margin-bottom:16px">${escHtml(reward)}</div>
    <button onclick="this.closest('[style*=inset]').remove()" style="padding:9px 28px;border:none;background:var(--green);color:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px">好的！</button>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 8000);
}

// ── 即時滿足結束 ──────────────────────────────────────────

// ── Manual sync on syncDot click ──
async function syncDotClicked() {
  const url = getApiUrl();
  // Firebase 模式下沒有 API URL，直接手動同步；無任何連線才開設定
  if (!url && !window._fbUid) { openApiModal(); return; }
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
};

// ── Local-timezone date helper ──
// Always returns YYYY-MM-DD in the device's local timezone (not UTC).
// This prevents tasks completed after 8 PM in UTC+8 from being attributed to the previous day.
function localDateStr(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

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
function scheduleCheckTaskDates() {
  if (_checkTaskDatesTimer) clearTimeout(_checkTaskDatesTimer);
  // 下一個重置點後 1 秒觸發（確保 runDailyReset 先跑完）
  const msUntil = getNextResetMs() + 1000;
  _checkTaskDatesTimer = setTimeout(() => {
    _checkTaskDatesTimer = null;
    checkTaskDates();
    scheduleCheckTaskDates(); // 排下一次
  }, msUntil);
}

const energyLabels = { charge: '充電', easy: '輕鬆', focus: '專注' };
const energyIcons  = { charge: '⚡', easy: '🍃', focus: '𖦏' };
