// ── Pull-to-Refresh ──────────────────────────────────────
(function() {
  if (window.matchMedia('(min-width: 681px)').matches) return; // 桌機不啟用
  const THRESHOLD = 72;
  let _startY = 0, _pulling = false, _loading = false;
  const indicator = document.getElementById('ptrIndicator');
  const ptrText   = document.getElementById('ptrText');
  const ptrArrow  = document.getElementById('ptrArrow');

  function getScrollEl() {
    // 找出目前可見頁面的 main 捲動容器
    return document.querySelector('main') || document.body;
  }

  document.addEventListener('touchstart', e => {
    if (_loading) return;
    const scrollEl = getScrollEl();
    if (scrollEl.scrollTop > 0) return; // 非頂部不觸發
    _startY = e.touches[0].clientY;
    _pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_pulling || _loading) return;
    const dy = e.touches[0].clientY - _startY;
    if (dy <= 0) { _pulling = false; return; }
    const scrollEl = getScrollEl();
    if (scrollEl.scrollTop > 0) { _pulling = false; return; }
    if (dy > 12) {
      indicator.classList.add('ptr-visible');
      if (dy >= THRESHOLD) {
        ptrText.textContent = '放開以重整';
        ptrArrow.style.transform = 'rotate(180deg)';
      } else {
        ptrText.textContent = '下拉重整';
        ptrArrow.style.transform = '';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', async e => {
    if (!_pulling || _loading) { _pulling = false; return; }
    const dy = e.changedTouches[0].clientY - _startY;
    _pulling = false;
    if (dy < THRESHOLD) {
      indicator.classList.remove('ptr-visible');
      ptrArrow.style.transform = '';
      return;
    }
    // 觸發重整
    _loading = true;
    indicator.classList.add('ptr-loading');
    ptrText.textContent = '同步中…';
    ptrArrow.style.transform = '';
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      if (window._fbUid) {
        const ok = await loadFromCloud();
        if (ok) {
          renderEnergyDots(); renderSandbox(); renderAll(); checkTaskDates(); initRoutines();
          showToast('✓ 已重整');
        } else {
          showToast('⚠️ 同步失敗，請稍後再試');
        }
      }
    } catch(err) {
      showToast('⚠️ 重整失敗');
    } finally {
      _loading = false;
      indicator.classList.remove('ptr-visible', 'ptr-loading');
    }
  }, { passive: true });
})();


// ══════════════════════════════════════════════════════════

// 每日重置：若上次重置週期已過，清空例行任務的 done 狀態
// 使用重置時間戳而非日期字串，確保 00:00~重置時間 之間不會提早重置
// _routineResetDate 已宣告於檔案頂部 sync 變數區
function maybeResetRoutines() {
  const thisCycleResetTs = getLastResetTimestamp();
  const thisCycleResetStr = String(thisCycleResetTs);
  // state.routineResetDate 向下相容：可能是舊的日期字串或新的時間戳字串
  const storedTs = state.routineResetDate && /^\d{10,}$/.test(state.routineResetDate)
    ? parseInt(state.routineResetDate) : 0;
  // ★ Fix：即使 in-memory 快取說已重置，仍要檢查是否有從雲端讀回來的舊勾選狀態需要清除
  // （LAST_RESET_KEY 本地已更新，但雲端 routines 仍是 done=true 的情況）
  // 注意：doneTs 為 null 代表舊版資料（加入 doneTs 欄位前完成的），保守視為需要重置
  const hasStaleRoutines = Array.isArray(state.routines) &&
    state.routines.some(it => it.done && (!it.doneTs || it.doneTs < thisCycleResetTs));
  if (_routineResetDate === thisCycleResetStr && !hasStaleRoutines) return;
  if (storedTs >= thisCycleResetTs && !hasStaleRoutines) {
    _routineResetDate = thisCycleResetStr;
    return;
  }
  if (!Array.isArray(state.routines)) state.routines = [];
  let resetCount = 0;
  state.routines.forEach(it => {
    // 若完成時間在上次重置點之前，或完全沒有完成時間戳（舊版資料），代表是上個週期完成的，需要重置
    const doneTsOk = it.doneTs && it.doneTs >= thisCycleResetTs;
    if (it.done && !doneTsOk) {
      it.done = false;
      it.doneDate = null;
      it.doneTs = null;
      resetCount++;
    }
  });
  _routineResetDate = thisCycleResetStr;
  state.routineResetDate = thisCycleResetStr;
  if (resetCount > 0) {
    renderRewards();
    if (typeof syncToCloud === 'function') syncToCloud();
  }
}

function openRoutinePanel() {
  maybeResetRoutines();
  renderRoutineList();
  document.getElementById('routineOverlay').classList.add('open');
  setTimeout(() => document.getElementById('routineInput').focus(), 80);
}
window.openRoutinePanel = openRoutinePanel;

function closeRoutinePanel() {
  document.getElementById('routineOverlay').classList.remove('open');
}
window.closeRoutinePanel = closeRoutinePanel;

function renderRoutineList() {
  if (!Array.isArray(state.routines)) state.routines = [];
  const items = state.routines;
  const list  = document.getElementById('routineList');
  const badge = document.getElementById('routineProgressBadge');
  const btnSpan = document.getElementById('routineBtnBadge');

  const doneCount = items.filter(it => it.done).length;
  const total = items.length;

  if (badge) badge.textContent = doneCount + '/' + total;

  const fragEl = document.getElementById('routineFragmentCount');
  if (fragEl) fragEl.textContent = getAvailableWishPoints();

  if (btnSpan) {
    if (total > 0) {
      btnSpan.style.display = 'inline-block';
      btnSpan.textContent   = doneCount + '/' + total;
      btnSpan.style.background = (doneCount === total && total > 0) ? 'rgba(58,110,165,0.25)' : 'var(--green-dim)';
      btnSpan.style.color      = 'var(--green)';
    } else {
      btnSpan.style.display = 'none';
    }
  }

  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = '<div class="routine-empty">還沒有例行任務。<br>新增你每天都要做的事吧！</div>';
    return;
  }

  // 未完成保持使用者排序，已完成沉到底部
  const undone = items.filter(it => !it.done);
  const done   = items.filter(it =>  it.done);
  const sorted = [...undone, ...done];

  list.innerHTML = sorted.map(it => `
    <div class="routine-item${it.done ? ' done-routine' : ''}"
      id="routine-${it.id}" draggable="true"
      ondragstart="routineDragStart(event,${it.id})"
      ondragover="routineDragOver(event,${it.id})"
      ondrop="routineDrop(event,${it.id})"
      ondragend="routineDragEnd()"
      onclick="toggleRoutineItem(${it.id})">
      <span class="routine-drag-handle" onclick="event.stopPropagation()" title="拖曳排序">⠿</span>
      <div class="routine-check">${it.done ? '✓' : ''}</div>
      <span class="routine-name">${escHtml(it.name)}</span>
      <span class="routine-del" onclick="event.stopPropagation();deleteRoutineItem(${it.id})" title="刪除">×</span>
    </div>`).join('');
  _routineWireTouchDrag(list);
}

function toggleRoutineItem(id) {
  if (!Array.isArray(state.routines)) state.routines = [];
  const it = state.routines.find(x => x.id === id);
  if (!it) return;
  const wasDone = it.done;
  const todayKey = localDateStr();
  it.done = !it.done;
  it.doneDate = it.done ? todayKey : null;
  it.doneTs = it.done ? Date.now() : null;

  if (state.wishPoints === undefined) state.wishPoints = 0;

  if (!wasDone) {
    // 完成：+1 願望碎片
    state.wishPoints++;
    saveStateLocal();
    renderRewards();
    checkRandomMissionProgress();
    _markSyncWrite();
    syncToCloud();

    // ── 動畫：checkmark 彈跳 + badge 從 item 飛出 ──
    const itemEl = document.getElementById(`routine-${id}`);
    if (itemEl) {
      itemEl.classList.add('routine-complete-flash');
      setTimeout(() => itemEl.classList.remove('routine-complete-flash'), 600);

      // badge 從 item 位置飛出
      const rect = itemEl.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.textContent = '🌟 +1 願望碎片';
      badge.style.cssText = `
        position:fixed;
        left:${rect.left + rect.width / 2}px;
        top:${rect.top}px;
        transform:translate(-50%, -8px);
        background:#3A6EA5;color:#fff;
        font-size:13px;font-weight:700;
        padding:5px 12px;border-radius:20px;
        white-space:nowrap;pointer-events:none;
        z-index:99998;
        box-shadow:0 2px 12px rgba(0,0,0,0.18);
        animation:rewardBadgeFly 1.4s cubic-bezier(0.22,1,0.36,1) forwards;
      `;
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 1500);
    } else {
      showToast('🌟 +1 願望碎片');
    }
  } else {
    // 取消：-1 願望碎片
    state.wishPoints = Math.max(0, state.wishPoints - 1);
    saveStateLocal();
    renderRewards();
    _markSyncWrite();
    syncToCloud();
    showToast('🌟 -1 願望碎片');
    // 紅色閃爍回饋
    const itemEl = document.getElementById(`routine-${id}`);
    if (itemEl) {
      itemEl.classList.add('routine-undo-flash');
      setTimeout(() => itemEl.classList.remove('routine-undo-flash'), 500);
    }
  }

  renderRoutineList();
}
window.toggleRoutineItem = toggleRoutineItem;

function addRoutineItem() {
  const input = document.getElementById('routineInput');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  if (!Array.isArray(state.routines)) state.routines = [];
  // 防止重複：若已有完全相同名稱的例行任務，不新增
  const isDuplicate = state.routines.some(r => r.name.trim() === name);
  if (isDuplicate) {
    showToast('⚠️ 已有相同名稱的例行任務');
    input.select();
    return;
  }
  state.routines.push({ id: Date.now(), name, done: false, doneDate: null });
  input.value = '';
  if (typeof _syncNow === 'function') _syncNow();
  renderRoutineList();
  input.focus();
}
window.addRoutineItem = addRoutineItem;

function deleteRoutineItem(id) {
  if (!Array.isArray(state.routines)) state.routines = [];
  state.routines = state.routines.filter(x => x.id !== id);
  if (typeof _syncNow === 'function') _syncNow();
  renderRoutineList();
}
window.deleteRoutineItem = deleteRoutineItem;

// ── Routine drag & drop ──
let _routineDragId = null;

function routineDragStart(e, id) {
  _routineDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById('routine-' + id);
    if (el) el.classList.add('dragging-routine');
  }, 0);
}
window.routineDragStart = routineDragStart;

function routineDragOver(e, id) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.routine-item').forEach(el => el.classList.remove('drag-over-routine'));
  if (id !== _routineDragId) {
    const el = document.getElementById('routine-' + id);
    if (el) el.classList.add('drag-over-routine');
  }
}
window.routineDragOver = routineDragOver;

function routineDrop(e, toId) {
  e.preventDefault();
  document.querySelectorAll('.routine-item').forEach(el =>
    el.classList.remove('drag-over-routine', 'dragging-routine'));
  if (!_routineDragId || _routineDragId === toId) { _routineDragId = null; return; }
  if (!Array.isArray(state.routines)) { _routineDragId = null; return; }
  const fromIdx = state.routines.findIndex(x => x.id === _routineDragId);
  const toIdx   = state.routines.findIndex(x => x.id === toId);
  if (fromIdx < 0 || toIdx < 0) { _routineDragId = null; return; }
  const [moved] = state.routines.splice(fromIdx, 1);
  state.routines.splice(toIdx, 0, moved);
  _routineDragId = null;
  if (typeof syncToCloud === 'function') syncToCloud();
  renderRoutineList();
}
window.routineDrop = routineDrop;

function routineDragEnd() {
  document.querySelectorAll('.routine-item').forEach(el =>
    el.classList.remove('drag-over-routine', 'dragging-routine'));
  _routineDragId = null;
}
window.routineDragEnd = routineDragEnd;

// 手機觸控拖曳
function _routineWireTouchDrag(list) {
  if (!list) return;
  let _tid = null, _clone = null, _startY = 0, _startX = 0;
  list.querySelectorAll('.routine-drag-handle').forEach(handle => {
    handle.addEventListener('touchstart', e => {
      const item = handle.closest('.routine-item');
      if (!item) return;
      const m = item.id.match(/routine-(\d+)/);
      if (!m) return;
      _tid = parseInt(m[1]);
      _startY = e.touches[0].clientY;
      _startX = e.touches[0].clientX;
      const rect = item.getBoundingClientRect();
      _clone = item.cloneNode(true);
      _clone.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.8;width:' + rect.width + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;border-radius:9px;box-shadow:0 8px 24px rgba(58,110,165,0.25);transition:none';
      document.body.appendChild(_clone);
      item.classList.add('dragging-routine');
      e.preventDefault();
    }, { passive: false });
  });

  list.addEventListener('touchmove', e => {
    if (_tid === null || !_clone) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - _startY;
    const dx = e.touches[0].clientX - _startX;
    _clone.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    document.querySelectorAll('.routine-item').forEach(el => el.classList.remove('drag-over-routine'));
    const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const targetItem = target && target.closest('.routine-item');
    if (targetItem && targetItem.id !== 'routine-' + _tid) {
      targetItem.classList.add('drag-over-routine');
    }
  }, { passive: false });

  list.addEventListener('touchend', e => {
    if (_tid === null) return;
    if (_clone) { _clone.remove(); _clone = null; }
    document.querySelectorAll('.routine-item').forEach(el =>
      el.classList.remove('dragging-routine', 'drag-over-routine'));
    const pt = e.changedTouches[0];
    const target = document.elementFromPoint(pt.clientX, pt.clientY);
    const targetItem = target && target.closest('.routine-item');
    if (targetItem) {
      const m = targetItem.id.match(/routine-(\d+)/);
      if (m) routineDrop({ preventDefault: () => {} }, parseInt(m[1]));
    }
    _tid = null;
  });
}

// 初始化：由 init() 在 state 載入後呼叫，不再使用魔法 timeout
// （避免雲端資料尚未回來時用空 state 渲染，導致 badge 不更新）
function initRoutines() {
  maybeResetRoutines();
  renderRoutineList();
}
window.initRoutines = initRoutines;
