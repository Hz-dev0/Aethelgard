// ── Recurring Morning Check-in Dialog ──────────────────

let _recurMorningChecked = new Set();

// 計算某任務的連續完成天數（從 doneHistory + task.recentCompletions 推算）
function _getTaskConsecutiveDays(task) {
  const history = state.doneHistory || [];
  // 收集所有完成日期（doneHistory + task 自身 recentCompletions）
  const dateSet = new Set();
  history.filter(h => (h.taskId === task.id || h.name === task.name) && h.completedAt && !h._neglectReset)
    .forEach(h => dateSet.add(h.completedAt));
  if (Array.isArray(task.recentCompletions)) {
    task.recentCompletions.forEach(d => dateSet.add(d));
  }
  if (task.completedAt) dateSet.add(task.completedAt);

  if (dateSet.size === 0) return 0;

  // 從昨天開始往回數連續天數（今天尚未完成）
  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1); // 昨天
  while (true) {
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (dateSet.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// 計算某任務的總完成次數（doneHistory + task.completionCount）
function _getTaskTotalCompletions(task) {
  const fromHistory = (state.doneHistory || [])
    .filter(h => (h.taskId === task.id || h.name === task.name) && h.completedAt && !h._neglectReset)
    .length;
  return fromHistory + (task.completionCount || 0);
}

function _getRecurringTasksDueToday() {
  const todayStr = localDateStr();
  const result = [];

  state.tasks.forEach(t => {
    if (t.done) return;
    if (!t.recurring) return;
    // 有「日期」的重複任務：把這個日期當成「重複到此為止」的截止日。
    // 過了這天（today > taskDate）就不再出現在批次清單，視為這個重複系列已結束。
    // 注意是 < 不是 <=：截止日當天仍要出現，讓使用者當天還能把它加入今日任務。
    if (t.taskDate && t.taskDate < todayStr) return;
    // 已釘選今日（且未取消）的不列出
    if (t.scheduledFor === todayStr && t.status !== 'cancelled') return;

    if (t.recurMode === 'daily' || !t.recurMode) {
      result.push({ task: t, freq: '每天' });
    } else if (t.recurMode === 'interval') {
      // 一般情況：scheduledFor 已到（含逾期補上）才出現。
      // 例外：這個任務綁了「截止日」、又還沒被排過（第一次出現，
      // 還沒有任何 scheduledFor 紀錄）——這種情況改用日期本身判斷要不要
      // 出現，否則一個全新、日期還沒到 scheduledFor 的「隔幾天重複＋
      // 有截止日」任務會永遠卡住、兩邊都進不去。
      const dueBySchedule = t.scheduledFor && t.scheduledFor <= todayStr;
      const dueByDateFirstTime = t.taskDate && !t.scheduledFor && t.taskDate <= todayStr;
      if (dueBySchedule || dueByDateFirstTime) {
        const days = t.recurInterval || 7;
        result.push({ task: t, freq: `每 ${days} 天` });
      }
    }
  });

  // 排序：完成次數越多排越前面（越常完成）
  result.sort((a, b) => {
    const ca = _getTaskTotalCompletions(a.task);
    const cb = _getTaskTotalCompletions(b.task);
    return cb - ca;
  });

  return result;
}

function showRecurMorningDialog() {
  const items = _getRecurringTasksDueToday();
  if (items.length === 0) return;

  const list = document.getElementById('recurMorningList');
  if (!list) return;

  _recurMorningChecked = new Set();
  // 連續三天（含）以上才預設勾選
  items.forEach(({task}) => {
    const streak = _getTaskConsecutiveDays(task);
    if (streak >= 3) {
      _recurMorningChecked.add(task.id);
    }
  });

  _renderRecurMorningList(items);
  document.getElementById('recurMorningOverlay').classList.add('open');
}

function _renderRecurMorningList(items) {
  const goalIconMap = { 技能:'🚩', 自我:'💎', 日常:'🧭' };
  const energyLabelMap = { charge:'⚡ 充電', easy:'🍃 輕鬆', focus:'𖦏 專注' };

  // Group: daily first, then interval
  const daily = items.filter(x => x.freq === '每天');
  const interval = items.filter(x => x.freq !== '每天');

  let html = '';
  if (daily.length > 0) {
    if (interval.length > 0) html += `<div class="rm-section-label">每日</div>`;
    html += daily.map(({task, freq}) => _recurMorningRowHTML(task, freq, goalIconMap, energyLabelMap)).join('');
  }
  if (interval.length > 0) {
    html += `<div class="rm-section-label">週期</div>`;
    html += interval.map(({task, freq}) => _recurMorningRowHTML(task, freq, goalIconMap, energyLabelMap)).join('');
  }

  document.getElementById('recurMorningList').innerHTML = html || '<div class="rm-empty">今日沒有重複任務。</div>';
}

function _recurMorningRowHTML(task, freq, goalIconMap, energyLabelMap) {
  const checked = _recurMorningChecked.has(task.id);
  const gIcon = goalIconMap[task.goal] || '●';
  const eLabel = energyLabelMap[task.energy] || '';
  const streak = _getTaskConsecutiveDays(task);
  const streakHint = streak >= 3 ? ` <span style="font-size:10px;color:var(--green);opacity:0.75">🔥${streak}天</span>` : '';
  // 有截止日的重複任務：在這裡標出來，讓使用者知道這個重複是有期限的
  // （到截止日當天還是會出現，過了那天才會從批次清單消失）
  const deadlineHint = task.taskDate ? ` <span style="font-size:10px;color:var(--text-faint)">· 至 ${task.taskDate}</span>` : '';
  return `<div class="rm-task-row${checked ? ' rm-checked' : ''}" onclick="recurMorningToggleRow(${task.id})" data-id="${task.id}">
    <div class="rm-checkbox">${checked ? '✓' : ''}</div>
    <div class="rm-task-info">
      <div class="rm-task-name">${escHtml(task.name)}${streakHint}</div>
      <div class="rm-task-meta">${gIcon} ${escHtml(goalLabel(task.goal))}${eLabel ? ' · ' + eLabel : ''}${deadlineHint}</div>
    </div>
    <div class="rm-freq-badge">${freq}</div>
  </div>`;
}

function recurMorningToggleRow(id) {
  if (_recurMorningChecked.has(id)) {
    _recurMorningChecked.delete(id);
  } else {
    _recurMorningChecked.add(id);
  }
  // Update just this row DOM
  const row = document.querySelector(`#recurMorningList [data-id="${id}"]`);
  if (row) {
    const checked = _recurMorningChecked.has(id);
    row.classList.toggle('rm-checked', checked);
    const cb = row.querySelector('.rm-checkbox');
    if (cb) cb.textContent = checked ? '✓' : '';
  }
}

function recurMorningToggleAll() {
  const items = _getRecurringTasksDueToday();
  const allChecked = items.every(({task}) => _recurMorningChecked.has(task.id));
  if (allChecked) {
    _recurMorningChecked.clear();
  } else {
    items.forEach(({task}) => _recurMorningChecked.add(task.id));
  }
  _renderRecurMorningList(items);
}

function confirmRecurMorning() {
  const todayStr = localDateStr();
  let count = 0;
  _recurMorningChecked.forEach(id => {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.scheduledFor = todayStr;
    t.status = 'active';
    count++;
  });
  // 確認後標記本週期已顯示（存時間戳字串），不再重複詢問
  document.getElementById('recurMorningOverlay').classList.remove('open');
  state.morningDialogShownDate = String(getLastResetTimestamp());
  syncToCloud();
  if (count > 0) {
    renderTodayPanel();
    renderTasks();
    renderTree(); // ★ 補上：分類卡片紅色未完成數量、生命樹右欄都要跟著更新
    showToast(`☀ 已加入 ${count} 個重複任務到今日清單`);
  }
}

// 跳過 / × 關閉：本週期不再詢問
function skipRecurMorningDialog() {
  document.getElementById('recurMorningOverlay').classList.remove('open');
  state.morningDialogShownDate = String(getLastResetTimestamp());
  syncToCloud();
}

function closeRecurMorningDialog() {
  skipRecurMorningDialog();
}

function maybeShowRecurMorningDialog() {
  // 每個重置週期只顯示一次 — 用重置時間戳比對（不用日期字串，避免 00:00 提早觸發）
  const thisCycleResetStr = String(getLastResetTimestamp());
  const stored = state.morningDialogShownDate;
  // 向下相容：舊版存日期字串，重置時間戳字串是純數字
  const alreadyShown = stored && /^\d{10,}$/.test(stored)
    ? parseInt(stored) >= getLastResetTimestamp()
    : false; // 舊格式一律視為未顯示，讓使用者升級後觸發一次
  if (alreadyShown) return;
  setTimeout(() => {
    const items = _getRecurringTasksDueToday();
    if (items.length > 0) showRecurMorningDialog();
  }, 800);
}

// 手動開啟「批次清單」（生命樹頁「批次加入任務」按鈕用）。
// 跟自動跳出的版本不同：不受「這個週期已經顯示過」的限制，隨時可以再打開；
// 而且名單是空的時候會明確告知，不會讓使用者以為按鈕沒反應。
function openBatchTaskList() {
  const items = _getRecurringTasksDueToday();
  if (items.length === 0) {
    showToast('📋 目前沒有等待加入的重複任務');
    return;
  }
  showRecurMorningDialog();
}
window.openBatchTaskList = openBatchTaskList;
window.recurMorningToggleRow = recurMorningToggleRow;
window.recurMorningToggleAll = recurMorningToggleAll;
window.confirmRecurMorning = confirmRecurMorning;
window.closeRecurMorningDialog = closeRecurMorningDialog;
window.skipRecurMorningDialog = skipRecurMorningDialog;

// ── End Recurring Morning Dialog ────────────────────────

init();
