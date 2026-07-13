// ── Done Calendar ──
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed
let calPopupEl = null;

function renderDoneCalendar(doneTasks, container) {
  // Build date → tasks map
  const byDate = {};
  doneTasks.forEach(t => {
    const d = t.completedAt || null;
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  // Build date → goalAchieved map: true if ALL treeNode goals met that day
  const goalAchievedDates = new Set();
  const allDates = Object.keys(byDate);
  allDates.forEach(dateStr => {
    const tasks = byDate[dateStr];
    const allMet = treeNodes.every(n => {
      const cnt = tasks.filter(t => t.goal === n.key).length;
      return cnt >= Math.max(1, n.dailyGoal || 1);
    });
    if (allMet) goalAchievedDates.add(dateStr);
  });

  const today = localDateStr();
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const dowNames = ['日','一','二','三','四','五','六'];

  // heat level: 0=none, 1=1-4, 2=5-9, 3=10+
  function heatLevel(n) {
    if (n === 0) return 0;
    if (n <= 4)  return 1;
    if (n <= 9)  return 2;
    return 3;
  }

  let html = `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="calPrevMonth()">‹</button>
      <span class="cal-month-label">${calYear} 年 ${monthNames[calMonth]}</span>
      <button class="cal-nav-btn" onclick="calNextMonth()">›</button>
    </div>
    <div class="cal-grid">
      ${dowNames.map(d => `<div class="cal-dow">${d}</div>`).join('')}
  `;

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const tasks = byDate[dateStr] || [];
    const n = tasks.length;
    const heat = heatLevel(n);
    const isToday = dateStr === today;
    const clickable = n > 0;
    const isGoalDay = goalAchievedDates.has(dateStr);
    html += `<div class="cal-day heat-${heat}${isToday ? ' today' : ''}${isGoalDay ? ' goal-achieved' : ''}"
      ${clickable ? `onclick="showCalPopup(event,'${dateStr}')"` : ''}
      title="${isGoalDay ? '🏆 達成每日目標！' : ''}${n > 0 ? n + ' 件完成' : ''}"
    >
      <span class="cal-day-date">${day}</span>
      ${n > 0 ? `<span class="cal-day-count">${n}</span>` : ''}
    </div>`;
  }

  html += `</div>
  <div class="cal-legend">
    <span>少</span>
    <div class="cal-legend-box" style="background:rgba(100,170,230,0.15);border:1px solid rgba(100,170,230,0.3)"></div>
    <div class="cal-legend-box" style="background:rgba(60,130,200,0.32);border:1px solid rgba(60,130,200,0.4)"></div>
    <div class="cal-legend-box" style="background:rgba(30,90,170,0.55);border:1px solid rgba(30,90,170,0.6)"></div>
    <span>多</span>
    <span style="margin-left:10px;color:var(--text-faint)">│</span>
    <div class="cal-legend-box" style="background:rgba(201,162,39,0.18);border:1.5px solid rgba(201,162,39,0.55)"></div>
    <span style="font-size:11px;color:var(--text-faint)">達成每日目標</span>
  </div>`;
  container.innerHTML = html;
}

function calPrevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderStats();
}

function calNextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderStats();
}

function showCalPopup(e, dateStr) {
  e.stopPropagation();
  closeCalPopup();

  // Gather tasks from both current done and doneHistory.
  // currentDone tasks have a real .id; doneHistory entries store the archive key as .id
  // (format: originalTaskId_completedAt). Use the archive key for dedup so that a
  // recurring task completed on different days never collides, and a task that appears
  // in both sources (archived then still active) is shown only once.
  const currentDone = state.tasks.filter(t => t.done && t.completedAt === dateStr);
  const historyRaw = (state.doneHistory || []).filter(t => t.completedAt === dateStr && !t._neglectReset); // 排除重新計算天數的 sentinel
  // 展開壓縮記錄：compressed entry → 每個任務名稱展成一筆假物件
  const historyDone = [];
  historyRaw.forEach(h => {
    if (h.compressed) {
      (h.tasks || []).forEach((name, i) => historyDone.push({ id: h.id + '_' + i, name, completedAt: h.completedAt, _fromCompressed: true }));
    } else {
      historyDone.push(h);
    }
  });

  const seen = new Set();
  const doneTasks = [];
  [...currentDone, ...historyDone].forEach(t => {
    // For currentDone: build the same archive-key format used when saving to history
    const archiveKey = t.taskId
      ? t.id                                      // already a history entry
      : String(t.id) + '_' + (t.completedAt || '');  // live task → derive key
    if (!seen.has(archiveKey)) { seen.add(archiveKey); doneTasks.push(t); }
  });

  const [y, m, d] = dateStr.split('-');
  const label = `${parseInt(m)} 月 ${parseInt(d)} 日`;

  const popup = document.createElement('div');
  popup.className = 'cal-popup';
  popup.id = 'calPopup';
  popup.innerHTML = `
    <div class="cal-popup-title">${label} 完成 ${doneTasks.length} 件 <span class="cal-popup-close" onclick="closeCalPopup()">×</span></div>
    ${doneTasks.map(t => `
      <div class="cal-popup-item">
        <span style="color:var(--green);flex-shrink:0">✓</span>
        <span>${escHtml(t.name)}${t.goal ? ` <span style="font-size:10px;color:var(--text-faint)">${escHtml(goalLabel(t.goal))}</span>` : ''}</span>
      </div>`).join('')}
  `;
  document.body.appendChild(popup);
  calPopupEl = popup;

  // Use requestAnimationFrame so the browser has a chance to compute the height first.
  const rect = e.target.getBoundingClientRect();
  requestAnimationFrame(() => {
    let left = rect.left + rect.width / 2 - 110;
    let top = rect.bottom + 8;
    if (left < 8) left = 8;
    if (left + 310 > window.innerWidth) left = window.innerWidth - 318;
    if (top + popup.offsetHeight > window.innerHeight) top = rect.top - 8 - popup.offsetHeight;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  });
}

function closeCalPopup() {
  if (calPopupEl) { calPopupEl.remove(); calPopupEl = null; }
}

document.addEventListener('click', (e) => {
  if (calPopupEl && !calPopupEl.contains(e.target)) closeCalPopup();
});

// ── Inline date picker for taskDate tag ──
let _datePickerEl = null;
function _closeDatePicker() {
  if (_datePickerEl) {
    _datePickerEl.remove();
    _datePickerEl = null;
    // 無論是點外部、按鈕確定、Escape 鍵，都一律移除監聽，避免殘留
    document.removeEventListener('click', _datePickerOutside);
  }
}
function openDateTagPicker(e, taskId) {
  _closeDatePicker();
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:fixed;z-index:9000;
    background:var(--bg2);border:1px solid rgba(130,154,177,0.4);
    border-radius:12px;padding:12px 14px;
    box-shadow:0 8px 28px rgba(58,110,165,0.18);
    display:flex;flex-direction:column;gap:10px;
    min-width:220px;animation:modalIn 0.15s ease;
  `;

  const input = document.createElement('input');
  input.type = 'date';
  input.value = t.taskDate || '';
  input.style.cssText = `
    width:100%;padding:8px 10px;border-radius:8px;
    border:1px solid var(--border);background:var(--bg3);
    color:var(--text);font-family:inherit;font-size:14px;outline:none;
  `;
  input.addEventListener('focus', () => { input.style.borderColor = 'var(--green)'; });
  input.addEventListener('blur',  () => { input.style.borderColor = 'var(--border)'; });

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '清除日期';
  clearBtn.style.cssText = `
    padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer;
    border:1px solid var(--border);background:transparent;color:var(--rose);font-family:inherit;
  `;
  clearBtn.onclick = () => {
    _applyDateChange(t, null);
    _closeDatePicker();
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '確定';
  confirmBtn.style.cssText = `
    padding:6px 14px;border-radius:7px;font-size:12px;cursor:pointer;
    border:none;background:var(--green);color:#fff;font-family:inherit;
  `;
  confirmBtn.onclick = () => {
    _applyDateChange(t, input.value || null);
    _closeDatePicker();
  };

  // Also confirm on Enter
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') confirmBtn.click();
    if (ev.key === 'Escape') _closeDatePicker();
  });

  btnRow.appendChild(clearBtn);
  btnRow.appendChild(confirmBtn);
  wrap.appendChild(input);
  wrap.appendChild(btnRow);
  document.body.appendChild(wrap);
  _datePickerEl = wrap;

  // Position near the tag
  const rect = e.target.getBoundingClientRect();
  requestAnimationFrame(() => {
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + 240 > window.innerWidth - 8) left = window.innerWidth - 248;
    if (top + wrap.offsetHeight > window.innerHeight - 8) top = rect.top - wrap.offsetHeight - 6;
    wrap.style.left = left + 'px';
    wrap.style.top = top + 'px';
  });

  setTimeout(() => input.focus(), 50);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _datePickerOutside);
  }, 0);
}
function _datePickerOutside(e) {
  if (_datePickerEl && !_datePickerEl.contains(e.target)) {
    _closeDatePicker();
    document.removeEventListener('click', _datePickerOutside);
  }
}
function _applyDateChange(t, newDate) {
  const todayStr = localDateStr();
  t.taskDate = newDate || null;
  if (newDate && newDate === todayStr && !t.scheduledFor && !t.done) {
    t.scheduledFor = todayStr;
    t.status = 'active';
    t._scheduledByDate = true;
  }
  if (!newDate && t._scheduledByDate) {
    t.scheduledFor = null;
    t.status = null;
    t._scheduledByDate = false;
  }
  // ★ Fix：日期變更後呼叫 checkTaskDates，確保設為今天（或已到期）的任務立即排入今日面板
  checkTaskDates();
  renderTasks(); renderStats();
  if (typeof _renderTreeRightPanel === 'function') _renderTreeRightPanel();
  showToast(newDate ? `📅 日期已更新為 ${newDate}` : '📅 日期已清除');
  syncToCloud();
}
window.openDateTagPicker = openDateTagPicker;
