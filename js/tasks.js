// ── Life Tree (responsive SVG) ──
const treeNodes = [
  { key: '技能', icon: '🚩', label: '限時活動', ringColor: '#D4608A', ringBg: 'rgba(212,96,138,0.10)', accent: '#D4608A', dailyGoal: 2 },
  { key: '自我', icon: '💎', label: '突破素材', ringColor: '#C9A227', ringBg: 'rgba(201,162,39,0.12)', accent: '#C9A227', dailyGoal: 1 },
  { key: '日常', icon: '🧭', label: '每日委託', ringColor: '#3A6EA5', ringBg: 'rgba(58,110,165,0.12)', accent: '#3A6EA5', dailyGoal: 3 },
];

function renderTree() {
  const grid = document.getElementById('treeGrid');
  if (!grid) return;
  // 使用「有效今日」：00:00~重置時間 之間仍屬上個週期的今天
  const todayStr = localDateStr(new Date(getLastResetTimestamp()));
  const r = 28, circ = 2 * Math.PI * r;
  // Load persisted dailyGoals if available
  const savedGoals = JSON.parse(localStorage.getItem('aethelgard_dailyGoals') || '{}');
  treeNodes.forEach(n => { if (savedGoals[n.key] !== undefined) n.dailyGoal = savedGoals[n.key]; });

  // ── 計算各分類的連續達標天數 streak ──
  function getGoalStreak(nodeKey, dailyGoal) {
    const goal = Math.max(1, dailyGoal || 1);
    let streak = 0;
    let cursor = new Date(getLastResetTimestamp());
    // 從昨天開始往回數（今天還沒結束）
    cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 180; i++) {
      const dateStr = localDateStr(cursor);
      // 當天完成數：active tasks + doneHistory
      const activeDone = state.tasks.filter(t => t.done && t.goal === nodeKey && t.completedAt === dateStr).length;
      const histDone = (state.doneHistory || []).filter(h => h.goal === nodeKey && h.completedAt === dateStr).length;
      if (activeDone + histDone >= goal) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  grid.innerHTML = treeNodes.map(n => {
    const doneCnt = state.tasks.filter(t => t.done && t.goal === n.key && t.completedAt === todayStr).length;
    const undoneTodayCnt = state.tasks.filter(t => !t.done && t.goal === n.key && t.scheduledFor === localDateStr()).length;
    const goal = Math.max(1, n.dailyGoal || 1);
    const pct = Math.min(1, doneCnt / goal);
    const offset = circ - pct * circ;
    const isActive = state.goalFilter === n.key;
    const activeStyle = isActive ? `box-shadow:0 0 0 2px ${n.ringColor};` : '';
    const overDone = doneCnt > goal;
    const labelColor = overDone ? n.ringColor : 'var(--text-dim)';
    const streak = getGoalStreak(n.key, n.dailyGoal);
    const streakHtml = streak >= 2
      ? `<div style="font-size:10px;color:${n.ringColor};font-weight:700;letter-spacing:0.02em;opacity:0.9">🔥${streak}天</div>`
      : '';
    return `<div class="goal-ring-card${isActive ? ' active-filter' : ''}"
      data-goal-key="${n.key}"
      onclick="filterByGoal('${n.key}')"
      oncontextmenu="openDailyGoalCtx(event,'${n.key}')"
      style="cursor:pointer;${activeStyle}">
      <div class="ring-wrap" style="position:relative;width:72px;height:72px;flex-shrink:0">
        <svg width="72" height="72" viewBox="0 0 72 72" style="position:absolute;top:0;left:0">
          <circle cx="36" cy="36" r="${r}" fill="none" stroke="${n.ringBg}" stroke-width="5"/>
          <circle cx="36" cy="36" r="${r}" fill="none" stroke="${n.ringColor}" stroke-width="5"
            stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 36 36)" style="transition:stroke-dashoffset 0.5s cubic-bezier(0.34,1.56,0.64,1)"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px">${n.icon}</div>
        ${undoneTodayCnt > 0 ? `<div class="goal-ring-badge">${undoneTodayCnt}</div>` : ''}
      </div>
      <div class="goal-ring-text">
        <div style="font-size:13px;font-weight:500;color:var(--text);line-height:1.3">${n.label}</div>
        <div style="font-size:11px;color:${labelColor}">${doneCnt}/${goal} 今日</div>
        ${streakHtml}
      </div>
    </div>`;
  }).join('');

  // Wire long-press for mobile (right-click doesn't exist on touch)
  treeNodes.forEach(n => {
    const el = grid.querySelector(`[oncontextmenu*="${n.key}"]`);
    if (!el) return;
    attachLongPress(el, () => {
      if (navigator.vibrate) navigator.vibrate(30);
      openDailyGoalCtx(null, n.key, el);
    });
  });

  renderTodayPanel();
  // ★ 桌面版：生命樹頁右欄（顯示目前選中分類的任務細項）。
  //   手機上沒有對應 DOM（getElementById 會是 null），函式內部會直接 return，無副作用。
  _renderTreeRightPanel();
}

// ── Wish Pool (許願池) ──
const goalIcons = { 技能:'🚩', 自我:'💎', 日常:'🧭', 任意:'🌈' };

// ★ 願望圖示：分類明確的（技能/自我/日常）維持原本有意義的圖示；
// 「任意分類」以前固定用 🌈，多數願望其實都是這個分類，導致清單裡一片彩虹很單調。
// 改成：預設用 id 做穩定 hash 從圖示池挑一個（同一個願望每次重新渲染都拿到一樣的
// 圖示，但不同願望彼此不同、也不會全部長一樣），使用者事後可在清單裡點擊圖示徽章
// 循環切換（存進 r.icon，之後 getWishIcon 就會優先採用）。
const WISH_ICON_POOL = ['❤️','💕','💖'];
function _hashToIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) { h = (h * 31 + String(str).charCodeAt(i)) | 0; }
  return Math.abs(h) % mod;
}
function getWishIcon(r) {
  if (r.icon) return r.icon;
  if (r.goal && r.goal !== '任意') return goalIcons[r.goal] || '🎯';
  return WISH_ICON_POOL[_hashToIndex(r.id, WISH_ICON_POOL.length)];
}

// ── 既有願望項目：點擊左側圖示徽章切換下一個圖示 ──
// ★ Bug fix：許願池列表裡每個願望的圖示徽章原本完全沒有綁定點擊事件，
// 點了沒反應。這裡補上 cycleWishIcon()，邏輯跟新增願望時的圖示選擇器一致：
// 依序在 WISH_ICON_POOL 裡循環，並把選到的圖示存進 r.icon（之後 getWishIcon 就會優先採用）。
function cycleWishIcon(id) {
  const r = (state.rewards || []).find(x => x.id === id);
  if (!r) return;
  const cur = getWishIcon(r);
  const idx = WISH_ICON_POOL.indexOf(cur); // 若目前顯示的是分類預設圖示（不在池子裡），idx 會是 -1 → 從池子第一個開始
  r.icon = WISH_ICON_POOL[(idx + 1) % WISH_ICON_POOL.length];
  renderRewards();
  _markSyncWrite();
  syncToCloud();
}
window.cycleWishIcon = cycleWishIcon;



let wishTab = 'wish'; // 'wish' or 'lottery'

function switchWishZoneTab(tab) {
  const wishPane    = document.getElementById('wishPoolPane');
  const lotteryPane = document.getElementById('lotteryPane');
  const addBtn      = document.getElementById('wishAddBtn');
  const tabWish    = document.getElementById('tabWishZone');
  const tabLottery = document.getElementById('tabLotteryZone');
  [tabWish, tabLottery].forEach(t => t && t.classList.remove('active'));
  if (wishPane)    wishPane.style.display    = 'none';
  if (lotteryPane) lotteryPane.style.display = 'none';
  if (addBtn) addBtn.style.display = 'none';
  if (tab === 'wish')    { if(tabWish) tabWish.classList.add('active');       if(wishPane) wishPane.style.display = 'block';       if (addBtn) addBtn.style.display = 'inline-flex'; }
  if (tab === 'lottery') { if(tabLottery) tabLottery.classList.add('active'); if(lotteryPane) lotteryPane.style.display = 'block'; renderLottery(); }
}



let taskSectionOpen = true;
function toggleTaskSection() {
  taskSectionOpen = !taskSectionOpen;
  const body  = document.getElementById('taskSectionBody');
  const arrow = document.getElementById('taskSectionArrow');
  if (body) {
    body.style.maxHeight = taskSectionOpen ? '200px' : '0';
    body.style.opacity   = taskSectionOpen ? '1' : '0';
  }
  if (arrow) arrow.style.transform = taskSectionOpen ? '' : 'rotate(-90deg)';
}

function getGlobalGoalCount(goal) {
  const doneTasks = state.tasks.filter(t => t.done);
  const history = state.doneHistory || [];
  // Deduplicate: history entries use id = originalId + '_' + completedAt
  // A done task in state.tasks may also exist in doneHistory (archived then re-counted).
  // Use a Set of "taskId|completedAt" keys to avoid double-counting.
  const seen = new Set();
  let count = 0;
  const add = (t, goalField) => {
    const key = String(t.id || t.name) + '|' + (t.completedAt || '');
    if (seen.has(key)) return;
    seen.add(key);
    if (goal === '任意' || (t[goalField] || t.goal) === goal) count++;
  };
  doneTasks.forEach(t => add(t, 'goal'));
  history.forEach(t => add(t, 'goal'));
  return count;
}

function getGoalCount(goal) {
  return getGlobalGoalCount(goal);
}

function getWishProgress(r) {
  // Progress is purely the manually allocated points on this wish
  return r.allocatedPoints || 0;
}

function getAvailableWishPoints() {
  if (state.wishPoints === undefined) state.wishPoints = 0;
  const allocated = (state.rewards || []).reduce((sum, r) => sum + (r.allocatedPoints || 0), 0);
  return Math.max(0, state.wishPoints - allocated);
}

function allocateWishPoint(id) {
  const r = state.rewards.find(x => x.id === id);
  if (!r) return;
  if (getAvailableWishPoints() <= 0) { showToast('❌ 沒有可用的願望碎片，完成任務來獲得！'); return; }
  // 先抓按鈕位置，等等拿來定位飄浮的 +1／解鎖動畫（renderRewards 之後元素會被整個換掉）
  const btn = document.getElementById('wishAllocBtn-' + id);
  const btnRect = btn ? btn.getBoundingClientRect() : null;
  if (!r.allocatedPoints) r.allocatedPoints = 0;
  r.allocatedPoints++;
  const justUnlocked = r.count > 0 && r.allocatedPoints >= r.count;
  checkRewardUnlocks();
  renderRewards();
  // ★ 改為立即同步（原本用 debounce 的 syncToCloud，無痕模式下配點後很快關閉
  //   分頁，等待期間的資料可能連本地備份都沒有，直接遺失）
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  _markSyncWrite();
  _doSyncToCloud();
  _flyWishPoint(btnRect, justUnlocked);
}

// ★ 配點的即時回饋：一般點擊飄出「+1」，解鎖那一下改成更醒目的慶祝文字，
// 讓每次配點都有一點小小的正向回饋，累積起來更想繼續換獎品。
function _flyWishPoint(rect, celebrate) {
  if (!rect) return;
  const fly = document.createElement('div');
  fly.textContent = celebrate ? '🎉 解鎖了！' : '+1';
  fly.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top}px;
    transform:translate(-50%,0);font-size:${celebrate ? '13px' : '15px'};font-weight:700;
    color:${celebrate ? '#b8922a' : 'var(--green)'};pointer-events:none;z-index:99999;
    white-space:nowrap;animation:wishPointFly 0.9s ease-out forwards`;
  document.body.appendChild(fly);
  setTimeout(() => fly.remove(), 950);
}
window._flyWishPoint = _flyWishPoint;

function deallocateWishPoint(id) {
  const r = state.rewards.find(x => x.id === id);
  if (!r || !r.allocatedPoints || r.allocatedPoints <= 0) return;
  r.allocatedPoints--;
  renderRewards();
  // ★ 同上，改為立即同步，不等 debounce
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  _markSyncWrite();
  _doSyncToCloud();
}

function renderRewards() {
  // ★ 頭部碎片顯示（桌面版專用，手機版該元素 display:none，更新無副作用）
  // 放在 wishList 的早退判斷之前，確保不論目前在哪個頁面都會更新數字
  const headerFragEl = document.getElementById('headerFragmentCount');
  if (headerFragEl) headerFragEl.textContent = getAvailableWishPoints();

  const wishList = document.getElementById('wishList');
  const wishEmpty = document.getElementById('wishEmpty');
  if (!wishList) return;

  // 更新許願池可用碎片數
  const fragCountEl = document.getElementById('wishFragmentCount');
  if (fragCountEl) fragCountEl.textContent = getAvailableWishPoints();
  const routineFragEl = document.getElementById('routineFragmentCount');
  if (routineFragEl) routineFragEl.textContent = getAvailableWishPoints();

  // 清掉舊的願望碎片框（如果存在）
  const oldBar = document.getElementById('wishPointsBar');
  if (oldBar) oldBar.remove();

  const available = getAvailableWishPoints();
  // ★ 維持願望新增時的固定順序，不因配點/進度變化而重新排序，避免使用者點錯願望
  const wishes = (state.rewards || []).slice();

  if (wishes.length === 0) {
    wishList.innerHTML = '';
    if (wishEmpty) wishEmpty.style.display = 'block';
  } else {
    if (wishEmpty) wishEmpty.style.display = 'none';
    const goalAccent = { 技能: '#3A6EA5', 自我: '#c0565a', 日常: '#829AB1', 任意: '#829AB1' };
    wishList.innerHTML = wishes.map(r => {
      const current = getWishProgress(r);
      const unlocked = current >= r.count;
      const pct = r.count === 0 ? 100 : Math.min(100, Math.round(current / r.count * 100));
      const remaining = Math.max(0, r.count - current);
      const icon = getWishIcon(r);
      const accent = goalAccent[r.goal] || '#3A6EA5';
      const canAdd = available > 0 && !unlocked;
      // ★ 快解鎖了：進度 ≥70% 時給更強的視覺提示，製造「快到了」的動力
      const nearDone = !unlocked && pct >= 70;
      // Progress bar：漸層填色，快解鎖時加上一點光暈
      const barColor = unlocked
        ? 'linear-gradient(90deg, rgba(201,162,39,0.55), rgba(201,162,39,0.75))'
        : nearDone
          ? 'linear-gradient(90deg, rgba(58,110,165,0.7), rgba(201,162,39,0.75))'
          : 'linear-gradient(90deg, rgba(58,110,165,0.55), rgba(58,110,165,0.8))';
      const barBg    = unlocked ? 'rgba(201,162,39,0.12)' : 'rgba(58,110,165,0.1)';
      const itemOpacity = unlocked ? '0.6' : '1';
      const itemBorder  = unlocked ? 'rgba(201,162,39,0.3)' : nearDone ? 'rgba(201,162,39,0.45)' : 'var(--border)';
      return `<div class="sandbox-item wish-item${nearDone ? ' wish-near' : ''}" id="wish-${r.id}"
        style="cursor:default;justify-content:space-between;gap:8px;flex-direction:column;
               padding:12px 14px;user-select:none;position:relative;
               opacity:${itemOpacity};
               border-color:${itemBorder};
               background:${unlocked ? 'rgba(201,162,39,0.04)' : nearDone ? 'rgba(201,162,39,0.03)' : 'rgba(255,255,255,0.02)'};
               transition:opacity 0.4s,border-color 0.4s,background 0.4s"
        data-wish-id="${r.id}">
        <div style="display:flex;align-items:center;gap:12px;width:100%">
          <!-- 分類圖示徽章：加大存在感，點擊可切換下一個圖示 -->
          <div onclick="event.stopPropagation();cycleWishIcon(${r.id})" title="點擊切換圖示"
               style="flex-shrink:0;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;
                      font-size:18px;background:${unlocked ? 'rgba(201,162,39,0.14)' : `${accent}1f`};
                      cursor:pointer;transition:background 0.4s">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;color:${unlocked ? 'rgba(201,162,39,0.85)' : 'var(--text)'};font-weight:600;transition:color 0.4s">${escHtml(r.name)}</span>
              ${unlocked
                ? `<span style="font-size:10px;color:rgba(201,162,39,0.8);white-space:nowrap;font-weight:600;letter-spacing:0.04em">✓ 已解鎖</span>`
                : nearDone
                  ? `<span style="font-size:10px;color:#b8922a;white-space:nowrap;font-weight:700;letter-spacing:0.02em">🔥 還差 ${remaining} 點就解鎖！</span>`
                  : `<span style="font-size:10px;color:var(--text-faint);white-space:nowrap">${current} / ${r.count}（還差 ${remaining}）</span>`}
            </div>
            <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${escHtml(r.goal)}</div>
            <!-- Progress bar -->
            <div style="margin-top:8px;height:6px;border-radius:3px;background:${barBg};overflow:hidden;transition:background 0.4s">
              <div style="height:100%;width:${pct}%;border-radius:3px;background:${barColor};transition:width 0.5s ease,background 0.4s${nearDone ? ';box-shadow:0 0 6px rgba(201,162,39,0.5)' : ''}"></div>
            </div>
          </div>
          <!-- Allocate point button -->
          <button title="${canAdd ? `配入一點（剩餘 ${available} 點）` : available <= 0 ? '完成任務來獲得願望碎片' : '已解鎖'}"
            id="wishAllocBtn-${r.id}"
            style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
                   width:48px;height:48px;border-radius:10px;border:1.5px solid ${canAdd ? 'var(--green)' : 'var(--border)'};
                   background:${canAdd ? 'rgba(58,110,165,0.08)' : 'transparent'};
                   cursor:${unlocked ? 'default' : 'pointer'};transition:all 0.2s;font-family:inherit;
                   -webkit-tap-highlight-color:transparent;touch-action:manipulation;
                   ${unlocked ? 'opacity:0.35' : ''}"
            ${canAdd ? `onmouseover="this.style.background='rgba(58,110,165,0.18)';this.style.transform='scale(1.08)'" onmouseout="this.style.background='rgba(58,110,165,0.08)';this.style.transform='scale(1)'"` : ''}>
            <span style="font-size:18px;line-height:1">${unlocked ? '🔓' : canAdd ? '🗝️' : '🔒'}</span>
            <span style="font-size:9px;color:${canAdd ? 'var(--green)' : 'var(--text-faint)'};font-weight:600;letter-spacing:0.04em">${canAdd ? '+1' : unlocked ? '已解鎖' : '不足'}</span>
          </button>
        </div>
      </div>`;
    }).join('');

    // Attach long-press for edit/delete context menu on each wish item
    wishes.forEach(r => {
      const el = document.getElementById('wish-' + r.id);
      if (!el) return;
      const current = getWishProgress(r);
      const unlocked = current >= r.count;
      attachLongPress(el, () => {
        if (navigator.vibrate) navigator.vibrate(30);
        const rect = el.getBoundingClientRect();
        showWishCtxMenu(r.id, unlocked, rect.left + rect.width/2, rect.top);
      });
      // Wire allocate button for both click and touchend (mobile fix)
      const allocBtn = document.getElementById('wishAllocBtn-' + r.id);
      if (allocBtn && !unlocked) {
        const doAlloc = (e) => { e.preventDefault(); e.stopPropagation(); allocateWishPoint(r.id); };
        // stopPropagation on touchstart prevents the parent wish-item's long-press timer from starting
        allocBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
        allocBtn.addEventListener('click', doAlloc);
        allocBtn.addEventListener('touchend', doAlloc, { passive: false });
      }
    });
  }
  renderQuotes();
}

function renderQuotes() {
  const el = document.getElementById('quoteList');
  if (!el) return;
  const custom = state.customQuotes || [];
  if (custom.length === 0) {
    el.innerHTML = '<div style="color:var(--text-faint);font-size:13px;font-style:italic;padding:8px">還沒有自訂格言。加入幾句讓你有力量的話吧！</div>';
    // clear and return early, still allow input
    return;
  }
  el.innerHTML = custom.map((t, i) => `
    <div class="sandbox-item custom-quote" id="cq-${i}" style="justify-content:space-between">
      <span class="sandbox-text" style="font-style:italic;color:var(--text)">✦ ${t}</span>
      <div style="display:flex;gap:4px;flex-shrink:0;align-items:center">
        <span class="btn-edit-icon" onclick="openEditCustomQuote(${i})">✏️</span>
        <span class="sandbox-del" onclick="removeCustomQuote(${i})">×</span>
      </div>
    </div>`).join('');
  // No long-press: only pencil icon triggers edit
}

// ── Long-press helper ──
function attachLongPress(el, callback) {
  let timer = null;
  let longFired = false;
  const start = (e) => {
    longFired = false;
    timer = setTimeout(() => {
      timer = null;
      longFired = true;
      callback();
    }, 600);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('touchstart', (e) => {
    // 不呼叫 preventDefault，保留 click 事件的觸發能力
    start(e);
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    cancel();
    // 若長按已觸發，阻止後續 click 避免重複動作
    if (longFired) { e.preventDefault(); longFired = false; }
  }, { passive: false });
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('touchmove', cancel, { passive: true });
}

// ── Wish Action Buttons (long-press) ──
let _wishCtxMenu = null;
let _wishCtxId = null;

function showWishCtxMenu(id, unlocked, _x, _y) {
  closeWishCtxMenu();
  const el = document.getElementById('wish-' + id);
  if (!el) return;
  _wishCtxId = id;

  const btns = document.createElement('div');
  btns.id = 'wishCtxMenu';
  btns.style.cssText = `
    display:flex;gap:4px;justify-content:flex-end;
    margin-top:6px;
    animation:wishBtnIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
  `;

  const pill = (pid, icon, label, colorVar, bgVar) => `
    <button id="${pid}" style="
      display:flex;align-items:center;gap:4px;
      padding:4px 10px 4px 7px;
      border-radius:20px;
      border:1px solid ${colorVar};
      background:${bgVar};
      color:${colorVar};
      font-size:11px;font-weight:500;letter-spacing:0.02em;
      cursor:pointer;font-family:inherit;
      -webkit-tap-highlight-color:transparent;
      backdrop-filter:blur(4px);
      transition:background 0.15s;
    ">${icon} ${label}</button>`;

  btns.innerHTML =
    pill(`wishEditBtn_${id}`, '✏️', '編輯', 'var(--sky)', 'rgba(130,154,177,0.1)') +
    pill(`wishDelBtn_${id}`, '×', '刪除', 'var(--rose)', 'rgba(192,86,90,0.07)');

  el.appendChild(btns);
  _wishCtxMenu = btns;

  const editBtn = document.getElementById('wishEditBtn_' + id);
  const delBtn  = document.getElementById('wishDelBtn_' + id);

  const stopAll = (e) => { e.stopPropagation(); };

  if (editBtn) {
    editBtn.addEventListener('mouseenter', () => editBtn.style.background = 'rgba(130,154,177,0.22)');
    editBtn.addEventListener('mouseleave', () => editBtn.style.background = 'rgba(130,154,177,0.1)');
    editBtn.addEventListener('mousedown',  stopAll);
    editBtn.addEventListener('touchstart', stopAll, { passive: true });
    editBtn.addEventListener('touchend',   stopAll, { passive: true });
    editBtn.addEventListener('click', e => { e.stopPropagation(); closeWishCtxMenu(); openEditWish(id); });
  }
  if (delBtn) {
    delBtn.addEventListener('mouseenter', () => delBtn.style.background = 'rgba(192,86,90,0.18)');
    delBtn.addEventListener('mouseleave', () => delBtn.style.background = 'rgba(192,86,90,0.07)');
    delBtn.addEventListener('mousedown',  stopAll);
    delBtn.addEventListener('touchstart', stopAll, { passive: true });
    delBtn.addEventListener('touchend',   stopAll, { passive: true });
    delBtn.addEventListener('click', e => { e.stopPropagation(); closeWishCtxMenu(); deleteReward(id); });
  }

  // 任何地方按下（mouse 或 touch）都關閉，按鈕本身已 stopPropagation 所以不受影響
  setTimeout(() => {
    document.addEventListener('mousedown',  closeWishCtxMenuOnOutside);
    document.addEventListener('touchstart', closeWishCtxMenuOnOutside, { passive: true });
  }, 10);
}

function closeWishCtxMenu() {
  if (_wishCtxMenu) { _wishCtxMenu.remove(); _wishCtxMenu = null; }
  _wishCtxId = null;
  document.removeEventListener('mousedown',  closeWishCtxMenuOnOutside);
  document.removeEventListener('touchstart', closeWishCtxMenuOnOutside);
}
function closeWishCtxMenuOnOutside(e) {
  if (_wishCtxMenu && !_wishCtxMenu.contains(e.target)) closeWishCtxMenu();
}

// ── Edit Wish ──
let editWishId = null;
function openEditWish(id) {
  const r = state.rewards.find(x => x.id === id);
  if (!r) return;
  editWishId = id;
  document.getElementById('editWishName').value = r.name;
  document.getElementById('editWishGoal').value = r.goal;
  document.getElementById('editWishCount').value = r.count;
  document.getElementById('editWishModal').classList.add('open');
  setTimeout(() => document.getElementById('editWishName').focus(), 50);
}
function saveWishEdit() {
  const name = document.getElementById('editWishName').value.trim();
  if (!name) return;
  const r = state.rewards.find(x => x.id === editWishId);
  if (!r) return;
  r.name = name;
  r.goal = document.getElementById('editWishGoal').value;
  const newCount = parseInt(document.getElementById('editWishCount').value) || 3;
  if (newCount < 1) return;
  // count 改變就重置通知旗標（不論升降）
  if (newCount !== r.count) {
    r._notified = false;
  }
  r.count = newCount;
  closeModal('editWishModal');
  checkRewardUnlocks();
  renderRewards();
  showToast('🌊 願望已更新');
  syncToCloud();
}

// ── Edit Custom Quote ──
let editQuoteIdx = null;
function openEditCustomQuote(i) {
  if (!state.customQuotes || !state.customQuotes[i]) return;
  editQuoteIdx = i;
  document.getElementById('editQuoteText').value = state.customQuotes[i];
  document.getElementById('editQuoteModal').classList.add('open');
  setTimeout(() => document.getElementById('editQuoteText').focus(), 50);
}
function saveQuoteEdit() {
  const text = document.getElementById('editQuoteText').value.trim();
  if (!text) return;
  if (!state.customQuotes) state.customQuotes = [];
  state.customQuotes[editQuoteIdx] = text;
  closeModal('editQuoteModal');
  renderQuotes();
  showToast('✦ 格言已更新');
  syncToCloud();
}

function addCustomQuote() {
  const input = document.getElementById('quoteInput');
  const val = input.value.trim();
  if (!val) return;
  if (!state.customQuotes) state.customQuotes = [];
  state.customQuotes.unshift(val);
  input.value = '';
  renderQuotes();
  _syncNow();
}

function removeCustomQuote(i) {
  if (!state.customQuotes) return;
  state.customQuotes.splice(i, 1);
  renderQuotes();
  _syncNow();
}

// 1 個願望碎片 = 50 元（無條件進位，99 元需要 2 個碎片）
const WISH_FRAGMENT_VALUE = 50;

function setWishInputMode(mode) {
  const toggleBtn = document.getElementById('wishModeToggleBtn');
  const shardInput = document.getElementById('newRewardCount');
  const amountInput = document.getElementById('newRewardAmount');
  if (!toggleBtn || !shardInput || !amountInput) return;
  const isMoney = mode === 'money';
  toggleBtn.textContent = isMoney ? '💰' : '🌟';
  toggleBtn.title = isMoney ? '目前：金額（點一下切換回碎片數量）' : '目前：碎片數量（點一下切換成金額）';
  shardInput.style.display = isMoney ? 'none' : '';
  amountInput.style.display = isMoney ? '' : 'none';
  amountInput.dataset.active = isMoney ? '1' : '0';
  updateWishAmountHint();
}

function toggleWishInputMode() {
  const amountInput = document.getElementById('newRewardAmount');
  const isMoney = amountInput && amountInput.dataset.active === '1';
  setWishInputMode(isMoney ? 'shard' : 'money');
}

function updateWishAmountHint() {
  const amountInput = document.getElementById('newRewardAmount');
  const hint = document.getElementById('wishAmountHint');
  if (!amountInput || !hint) return;
  if (amountInput.style.display === 'none') { hint.style.display = 'none'; return; }
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) { hint.style.display = 'none'; return; }
  const shards = Math.ceil(amount / WISH_FRAGMENT_VALUE);
  hint.textContent = `= ${shards} 個碎片（每個碎片 ${WISH_FRAGMENT_VALUE} 元，不足 ${WISH_FRAGMENT_VALUE} 元無條件進位）`;
  hint.style.display = 'block';
}

function openAddWish() {
  document.getElementById('newRewardName').value = '';
  document.getElementById('newRewardCount').value = '3';
  document.getElementById('newRewardAmount').value = '';
  document.getElementById('wishAmountHint').style.display = 'none';
  setWishInputMode('shard');
  document.getElementById('addRewardModal').classList.add('open');
  setTimeout(() => document.getElementById('newRewardName').focus(), 50);
}


function addReward() {
  const name = document.getElementById('newRewardName').value.trim();
  if (!name) return;
  const goal = document.getElementById('newRewardGoal').value;
  const amountInput = document.getElementById('newRewardAmount');
  const isMoneyMode = amountInput && amountInput.dataset.active === '1';
  let count;
  if (isMoneyMode) {
    const amount = parseFloat(amountInput.value);
    count = amount > 0 ? Math.ceil(amount / WISH_FRAGMENT_VALUE) : 0;
  } else {
    const countVal = document.getElementById('newRewardCount').value;
    count = countVal === '' ? 0 : Math.max(0, parseInt(countVal) || 0);
  }
  if (!state.rewards) state.rewards = [];
  const startCount = getGoalCount(goal);
  const id = Date.now();
  state.rewards.push({ id, name, goal, count, startCount, claimed: false, allocatedPoints: 0 });
  closeModal('addRewardModal');
  renderRewards();
  showToast('🌊 願望已投入許願池');
  _syncNow();
}

function deleteReward(id) {
  const r = state.rewards.find(x => x.id === id);
  if (r && r.allocatedPoints) {
    // Points stay in state.wishPoints (total), just removing the wish frees them up automatically
    // because getAvailableWishPoints = total - sum(allocated), and this wish is gone
  }
  state.rewards = state.rewards.filter(r => r.id !== id);
  renderRewards();
  saveStateLocal();
  _syncNow();
}

function openClaimReward(id) {
  const r = state.rewards.find(x => x.id === id);
  if (!r) return;
  state.pendingClaimId = id;
  document.getElementById('claimRewardTitle').textContent = `🌊 ${r.name}`;
  document.getElementById('claimRewardDesc').textContent = `你在「${r.goal}」完成了 ${r.count} 個任務，這個願望準備成真了！`;
  document.getElementById('claimRewardModal').classList.add('open');
}

function claimReward() {
  const r = state.rewards.find(x => x.id === state.pendingClaimId);
  if (r) {
    // Spend the allocated points (deduct from total pool)
    const spent = r.allocatedPoints || 0;
    state.wishPoints = Math.max(0, (state.wishPoints || 0) - spent);
    // Remove the wish from the pool entirely
    state.rewards = state.rewards.filter(x => x.id !== state.pendingClaimId);
    // Also clean up any revealed lottery cards that reference this wish
    if (lotteryState.cards) {
      lotteryState.cards.forEach(c => {
        if (c.wishId === state.pendingClaimId) {
          c.isWish = false;
          c.wishId = null;
          c.icon = '🌊';
        }
      });
      saveLottery();
    }
    showToast('🎉 願望成真了！你值得的');
  }
  closeModal('claimRewardModal');
  renderRewards();
  renderLottery();
  _syncNow();
}

function checkRewardUnlocks() {
  if (!state.rewards) return;
  state.rewards.forEach(r => {
    if (!r.claimed && !r._notified && (r.allocatedPoints || 0) >= r.count && r.count > 0) {
      r._notified = true;
      setTimeout(() => showToast(`🌊 許願池解鎖！「${r.name}」出現在抽獎牌中了`), 1500);
    }
  });
}

// ── Daily Reset for Recurring Tasks ──
const RESET_TIME_KEY = 'aethelgard_reset_time';
const LAST_RESET_KEY = 'aethelgard_last_reset'; // 現在存時間戳（毫秒），不再存日期字串

function getResetTime() {
  return localStorage.getItem(RESET_TIME_KEY) || '04:00';
}

// 計算下一次重置距離現在的毫秒數
function getNextResetMs() {
  const [hStr, mStr] = getResetTime().split(':');
  const h = parseInt(hStr), m = parseInt(mStr);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// 取得「上一次應觸發的重置點」的 timestamp（毫秒）
// 今天的 HH:MM 若已過 → 今天的 HH:MM；否則 → 昨天的 HH:MM
function getLastResetTimestamp() {
  const [hStr, mStr] = getResetTime().split(':');
  const h = parseInt(hStr), m = parseInt(mStr);
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (candidate > now) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate.getTime();
}

// 判斷任務是否在「當前重置週期內」被標記為今日
// 即 scheduledAt >= 上次重置時間點
function isScheduledInCurrentCycle(task) {
  if (!task.scheduledAt) return false;
  return task.scheduledAt >= getLastResetTimestamp();
}

// 判斷任務是否為「預排」狀態：
// 在 00:00~重置時間 之間被標記為今日（時鐘已是新的一天，但週期還未重置）
// 這類任務是使用者預排給下一個週期用的，用銀色條區分，重置後自動變正常今日
function isPreScheduled(task) {
  if (!task.scheduledAt || task.done) return false;
  const lastReset = getLastResetTimestamp();
  const clockMidnight = new Date();
  clockMidnight.setHours(0, 0, 0, 0);
  // 預排條件：上次重置點在今天 00:00 之前（重置還沒到），且標記時間在 00:00 之後
  return lastReset < clockMidnight.getTime() && task.scheduledAt >= clockMidnight.getTime();
}

let _resetRunning = false;
function runDailyReset() {
  if (_resetRunning) return;
  _resetRunning = true;
  try {
  // ── 用時間戳判斷，不再用日期字串 ──
  // 避免 00:00~重置時間 這段開啟 app 就觸發提早重置
  const thisCycleResetTs = getLastResetTimestamp();
  const rawStored = localStorage.getItem(LAST_RESET_KEY);
  // 向下相容：舊版存的是日期字串（如 "2024-04-23"），數字解析後會是 NaN
  const lastResetTs = rawStored && /^\d{10,}$/.test(rawStored) ? parseInt(rawStored) : 0;
  if (lastResetTs >= thisCycleResetTs) { scheduleNextReset(); return; }
  // LAST_RESET_KEY 延後到重置工作完成後才寫入，避免中途例外導致永久鎖住
  const todayKey = localDateStr();

  if (!state.doneHistory) state.doneHistory = [];

  let resetCount = 0;
  const toDelete = [];

  // ── 每次重置：把「有 taskDate 且日期已到、但上個週期被手動取消」的任務解除 cancelled ──
  // 取消標記只作用於當個重置週期，新的一天應重新出現讓使用者決定
  state.tasks.forEach(t => {
    if (t.done || t.status !== 'cancelled' || !t.taskDate) return;
    if (t.taskDate <= todayKey) {
      t.status = null;
      t.scheduledFor = null; // 清掉，讓 checkTaskDates() 重新排入今日
    }
  });

  // ── 保護：在 00:00~重置時間 之間預先安排今日的任務，更新 scheduledFor 為真正的今天 ──
  // （避免 scheduledFor 停在昨天的日期被當成逾期）
  state.tasks.forEach(t => {
    if (t.done || !t.scheduledFor || t.status === 'cancelled') return;
    if (t.scheduledAt && t.scheduledAt >= thisCycleResetTs && t.scheduledFor < todayKey) {
      t.scheduledFor = todayKey;
    }
  });

  state.tasks.forEach(t => {
    if (!t.done) return;
    const archiveKey = t.id + '_' + t.completedAt;
    if (!state.doneHistory.some(h => h.id === archiveKey)) {
      state.doneHistory.push({ id: archiveKey, taskId: t.id, name: t.name, goal: t.goal, energy: t.energy, completedAt: t.completedAt, recurring: t.recurring || false });
    }
    // 有「截止日」的重複任務，過了截止日（今天 > taskDate）就視為這個重複
    // 系列已經結束，跟非重複任務一樣歸檔刪除，不再重置回「未完成」。
    const recurExpired = t.recurring && t.taskDate && todayKey > t.taskDate;
    // ★ 保護：若這筆完成發生在「本次重置週期開始之後」，代表使用者是在
    // 這個新週期裡才完成的（例如重置流程因例外狀況被重複觸發），
    // 不應該把它打回未完成——比照 routines 既有的 doneTs 判斷方式。
    const doneInCurrentCycle = t.completedTs && t.completedTs >= thisCycleResetTs;
    if (t.recurring && t.recurMode !== 'interval' && !recurExpired && doneInCurrentCycle) {
      return;
    }
    if (t.recurring && t.recurMode !== 'interval' && !recurExpired) {
      // Daily recurring（且還沒過截止日）: reset back to undone，清掉排程讓早晨對話框重新詢問
      if (state.done > 0) state.done--;
      t.done = false;
      t.postponed = 0;
      t.scheduledFor = null;
      t.scheduledAt = null;
      t.status = null;
      resetCount++;
    } else {
      // Non-recurring done task、interval task、或已過截止日的重複任務 → delete after reset
      toDelete.push(t.id);
      if (state.done > 0) state.done--;
    }
  });

  // Delete non-recurring completed tasks
  // 安全保護：只刪除已確認寫入 doneHistory 的任務，避免重置異常時資料消失
  if (toDelete.length > 0) {
    state.tasks = state.tasks.filter(t => {
      if (!toDelete.includes(t.id)) return true;
      const archiveKey = t.id + '_' + t.completedAt;
      return !state.doneHistory.some(h => h.id === archiveKey); // 未寫入則保留
    });
  }

  // ── 壓縮前一個週期的詳細 doneHistory → 精簡格式 ──
  // 只保留任務名稱，省 Firestore 空間；今天（當前週期）的不壓縮，保留復原能力
  (function compressPreviousDayHistory() {
    const yesterday = new Date(thisCycleResetTs - 1); // 重置點前一毫秒 = 前一週期日期
    const prevDateStr = localDateStr(yesterday);
    // 找出前一天的詳細記錄（非壓縮）
    const detailed = state.doneHistory.filter(h => !h.compressed && h.completedAt === prevDateStr);
    if (detailed.length === 0) return;
    // 組成壓縮記錄
    const compressed = {
      compressed: true,
      id: 'compressed_' + prevDateStr,
      completedAt: prevDateStr,
      tasks: detailed.map(h => h.name).filter(Boolean),
      count: detailed.length
    };
    // 移除詳細記錄，加入壓縮記錄（若尚未存在）
    const ids = new Set(detailed.map(h => h.id));
    state.doneHistory = state.doneHistory.filter(h => !ids.has(h.id));
    if (!state.doneHistory.some(h => h.id === compressed.id)) {
      state.doneHistory.push(compressed);
    }
    // [壓縮] ${prevDateStr} 的 ${detailed.length} 筆記錄已壓縮
  })();

  // Reset routine tasks for the new day and refund their wishPoints
  // (routines earn fresh points each day — yesterday's completions are refunded here)
  // Note: maybeResetRoutines() handles the actual reset + refund logic.
  // We call it here so the daily reset also resets routines atomically.
  if (Array.isArray(state.routines)) {
    let routineRefund = 0;
    state.routines.forEach(it => {
      // 若完成時間戳早於本次重置點，代表是上個週期完成的，需要重置
      const doneTsOk = it.doneTs && it.doneTs >= thisCycleResetTs;
      if (it.done && !doneTsOk) {
        it.done = false;
        it.doneDate = null;
        it.doneTs = null;
        routineRefund++;
      }
    });
    if (routineRefund > 0) {
      const allocated = (state.rewards || []).reduce((sum, r) => sum + (r.allocatedPoints || 0), 0);
      state.wishPoints = Math.max(allocated, (state.wishPoints || 0) - routineRefund);
    }
    // 同步 routineResetDate（時間戳字串），避免 maybeResetRoutines() 重複執行
    state.routineResetDate = String(thisCycleResetTs);
    _routineResetDate = String(thisCycleResetTs);
  }

  // 所有重置工作完成，才寫 LAST_RESET_KEY，確保中途例外不鎖住下次重置
  try { localStorage.setItem(LAST_RESET_KEY, String(thisCycleResetTs)); } catch(e) {}
  saveStateLocal(); // 含 cancelled 解除/scheduledFor 修正等隱性變動
  if (resetCount > 0 || toDelete.length > 0) {
    showToast(`🔁 ${resetCount} 個重複任務已重置，新的一天開始！`);
    _syncNow();
  } else {
    // ★ Fix：即使普通任務無重置，例行任務重置後仍需推送 routines 狀態和 routineResetDate 到雲端
    // 否則雲端保留舊的 done=true，下次從雲端讀取時例行任務看起來沒有重置
    _syncNow();
  }
  // Always re-render so interval clones scheduled for today appear in today panel
  renderAll();
  checkTaskDates();
  // Reset lottery day counters for new day — but ONLY if lotteryState is from a previous day.
  // If lotteryState.todayDate is already today (e.g. cloud-synced data), do NOT wipe
  // todayDone/todayFlipped — that would cause the 3/3 → 0/3 flash bug on refresh.
  if (lotteryState.todayDate !== todayKey) {
    lotteryState.todayDate = todayKey;
    lotteryState.todayDone = 0;
    lotteryState.todayFlipped = 0;
    lotteryState.rmSlot = null;
    lotteryState.cards = []; // clear deck so user must draw again
    // 隨機任務不隨每日 reset 消失，持續到下次洗牌前都可以完成並獲得對應卡片數量
    saveLottery();
  }
  renderLottery();
  // Show the recurring morning check-in dialog after reset
  setTimeout(() => { if (typeof maybeShowRecurMorningDialog === 'function') maybeShowRecurMorningDialog(); }, 1200);
  } finally {
    // 使用 try/finally 確保無論如何都會釋放 lock，避免 reset 永遠卡住
    _resetRunning = false;
    scheduleNextReset();
  }
}

let _resetTimer = null;
function scheduleNextReset() {
  if (_resetTimer) clearTimeout(_resetTimer);
  const msUntil = getNextResetMs();
  _resetTimer = setTimeout(() => { runDailyReset(); }, msUntil);
}

// 啟動時補跑錯過的重置（例如 app 關閉多天）
//
// ★ 修正舊版 bug：舊版會用一個「逐日往前走」的迴圈，每天呼叫一次 runDailyReset()，
// 想要一天一天補回來。但 runDailyReset() 內部的 thisCycleResetTs 一律用
// getLastResetTimestamp() 依「現在的實際時間」計算，跟迴圈的 cursor 完全無關，
// 所以無論迴圈跑幾輪，每一輪算出來的 thisCycleResetTs 其實都是同一個值
// （就是「現在」對應的那個重置點）。結果就是同一個重置週期被重複執行了 N 次
// （N = 錯過的天數），只是浪費效能、重複推送同步、重複跳提示，
// 在某些時序下（例如多分頁同時開啟、或使用者剛好在補跑期間操作）
// 還可能讓剛完成的重複任務被多算一次重置而誤判回未完成。
// runDailyReset() 本身已經是用「現在」一次算出最新的重置界線，
// 並會一次處理完所有目前已完成的任務／重複任務／例行任務，
// 所以不管錯過幾天，只需要解除舊的鎖（清掉過期的 LAST_RESET_KEY 守衛）
// 呼叫一次即可補到最新狀態，完全不需要逐日迴圈。
function checkMissedReset() {
  const rawStored = localStorage.getItem(LAST_RESET_KEY);
  // 向下相容：舊版存日期字串
  const lastResetTs = rawStored && /^\d{10,}$/.test(rawStored) ? parseInt(rawStored) : 0;

  if (!lastResetTs) {
    // 第一次執行或舊格式 — 從今天的重置點開始排程即可
    scheduleNextReset();
    return;
  }

  const thisCycleResetTs = getLastResetTimestamp();
  if (lastResetTs >= thisCycleResetTs) {
    // 本週期已重置，只需排程下一次（runDailyReset 內部的守衛也會擋掉重複執行）
    scheduleNextReset();
    return;
  }

  // 有錯過至少一個重置點：直接呼叫一次 runDailyReset()，
  // 它會依「現在」算出最新的重置界線並一次補齊。
  runDailyReset();
}

// ── Logo Long-Press Menu ──
function openLogoMenu(e) {
  const menu = document.getElementById('logoMenu');
  menu.style.display = 'block';
  // Position near logo
  const rect = document.getElementById('logoBtn').getBoundingClientRect();
  const menuW = 190;
  let left = rect.left;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.left = left + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';
}
function closeLogoMenu() {
  document.getElementById('logoMenu').style.display = 'none';
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('logoMenu');
  if (menu && !menu.contains(e.target) && e.target.id !== 'logoBtn') {
    menu.style.display = 'none';
  }
});

// ── Init ──
async function init() {
  // ── 鎖屏期間：不渲染任何主介面內容，syncDot 也先隱藏 ──
  // 鎖屏 overlay 已預設 display:flex，無需額外呼叫 openOwnerLoginOverlay
  const dot = document.getElementById('syncDot');
  if (dot) dot.style.display = 'none'; // 登入前隱藏同步燈

  // 等待 Firebase 登入就緒（Owner 自動免登入 或 訪客 OTP 驗證完成）
  // ★ Fix：提前設好 callback，消除 submitGuestToken 與 init 的競態條件
  let _initResolved = false;
  let _initResolveRef = null;
  const _earlyResolve = () => {
    if (!_initResolved) { _initResolved = true; if (_initResolveRef) _initResolveRef(); }
  };
  // ★ Race condition fix：透過 _registerFirebaseReadyCallback 設定，
  //   若 onAuthStateChanged 已比 init() 更早觸發（module 非同步載入），會立刻補呼叫。
  if (typeof window._registerFirebaseReadyCallback === 'function') {
    window._registerFirebaseReadyCallback(_earlyResolve);
  } else {
    window._onFirebaseReadyCallback = _earlyResolve;
  }
  window._fbGuestReadyResolve = _earlyResolve;

  await new Promise((resolve) => {
    // ★ 修正：只能信任 _initResolved（由 _onFirebaseReadyCallback 正確設定，
    //   且該 callback 會尊重 _fbGuestAccessPending 守門旗標）。
    //   絕對不能用 window._fbUid 是否有值來提前 resolve —— submitGuestToken()
    //   為了修另一個競態條件，會在 signInAnonymously() 完成、guest_access 文件
    //   寫入 Firestore「之前」就先同步把 window._fbUid 設成 ownerUid。
    //   若這裡拿 window._fbUid 當放行條件，會在 guest_access 文件還沒寫入時
    //   就提前呼叫 loadFromCloud()，被 Firestore 安全規則擋下讀成 null，
    //   這正是無痕模式下「驗證碼登入後看不到任務清單」的根因：無痕模式沒有
    //   快取憑證，signInAnonymously() 必須完整跟伺服器來回一趟、耗時較長，
    //   使 500ms 輪詢更容易搶在 guest_access 寫入完成前就看到 window._fbUid
    //   已有值而提前 resolve；一般模式下常因為時間差小而僥倖沒事。
    if (_initResolved) { resolve(); return; }
    _initResolveRef = resolve;
    // Safety net：每秒輪詢，涵蓋極端時序差的情況
    const _safetyTimer = setInterval(() => {
      if (_initResolved) { clearInterval(_safetyTimer); resolve(); }
    }, 500);
    // 30 秒後只有在已驗證的情況下才 resolve，否則繼續等待
    setTimeout(() => { clearInterval(_safetyTimer); if (_initResolved) resolve(); }, 30000);
  });

  {
    const btn = document.getElementById('settingsBtn');
    if (btn && window._fbUid) { btn.classList.add('connected'); btn.textContent = '☁ Connected'; }

    // ── 登入成功：恢復顯示 syncDot，開始載入 ──
    if (dot) { dot.style.display = ''; dot.className = 'sync-dot syncing'; }

    // ── 關閉登入 / 載入遮罩（含訪客模式用 ownerLoginOverlay 當橋接遮罩的情境）──
    // 注意：closeOwnerLoginOverlay 在雲端資料回來後才呼叫（見下方），
    // 這裡先渲染骨架（背後介面，被遮罩蓋住），等資料齊全再揭幕。

    // 只有 Owner（非訪客）且已登入時，才用本地快取做預顯示（加速啟動）
    if (window._fbIsOwner && window._fbUid) {
      try {
        const _preLocal = JSON.parse(localStorage.getItem('aethelgard_state_local') || 'null');
        if (_preLocal && Array.isArray(_preLocal.routines) && _preLocal.routines.length > 0) {
          state.routines = _preLocal.routines;
          state.routineResetDate = _preLocal.routineResetDate || null;
        }
      } catch(e) {}
      if (loadStateLocal()) {
        renderEnergyDots(); renderSandbox(); renderAll(); initRoutines(); checkTaskDates();
      }
    }

    const ok = await loadFromCloud();
    // ★ 修正嚴重資料遺失風險：_initDone 絕對不能在這裡無條件設成 true。
    //   _initDone 是 syncToCloud() / _doSyncToCloud() / _emergencySave() 用來擋
    //   「雲端資料還沒真正載入完成前，不准把記憶體裡的空 state 寫回雲端」的唯一防線
    //   （見 sync.js 裡 _emergencySave 的說明）。若無論 loadFromCloud() 成功與否都把它
    //   設成 true，一旦讀取失敗（例如訪客登入競態導致的 permission-denied、或單純
    //   網路抖動），state.tasks 這時仍是初始的空陣列，但 _initDone 已經是 true，
    //   任何後續觸發的 syncToCloud()／切分頁／關分頁的 _emergencySave() 都會把這個
    //   空 state 直接推回雲端唯一的 Aethelgard/data 文件，覆寫掉真實任務資料——
    //   這正是資料被清空的成因。現在只有讀取成功時才在這裡設 true；讀取失敗的分支
    //   已經各自正確處理（有本地備份就在那裡設 true，新裝置無備份則保持 false，
    //   直到背景重試成功為止，避免在空窗期把空資料寫上雲端）。
    if (ok) state._initDone = true;
    // ★ 載入完成後清除「使用者已編輯」旗標，避免下次 snapshot 到來時誤判本機版本比雲端新
    window._notesUserEdited = false;
    // ★ 重要：init 載入完成後立刻抑制 snapshot，避免舊版 snapshot 在 debounce 期間蓋掉剛載好的資料
    // （syncToCloud 有 30 秒 debounce，這段期間若 snapshot 進來，_markSyncWrite 尚未被呼叫，會覆寫資料）
    _markSyncWrite();
    // ★ 啟動即時監聽：init 完成後才開始，避免和初次讀取競態
    if (window._fbUid) _startRealtimeListener(window._fbUid);
    if (ok) {
      // 雲端資料載入後：確保 lotteryState 日期正確（可能跨日），並對齊實際完成數
      // 使用「有效今日」：00:00~重置時間 之間仍屬上個週期的今天
      const _today = localDateStr(new Date(getLastResetTimestamp()));
      if (lotteryState.todayDate !== _today) {
        // 跨日：重置當日計數
        lotteryState.todayDate = _today;
        lotteryState.todayDone = 0;
        lotteryState.todayFlipped = 0;
        lotteryState.rmSlot = null;
      } else {
        // 同一天：reconcile todayDone
        // 計算「目前仍在 tasks 裡的今日完成數」＋「已從 tasks 移除但計入 doneHistory 的今日完成數」
        // 後者涵蓋：非重複任務被 daily reset 刪除（interval 任務完成後保留在 tasks，換日才清除）
        const _activeDoneToday = state.tasks.filter(t => t.done && t.completedAt === _today).length;
        const _historyDoneToday = (state.doneHistory || []).filter(h => h.completedAt === _today).length;
        const _trueDoneToday = _activeDoneToday + _historyDoneToday;
        const minDone = (lotteryState.todayFlipped || 0) * 3;
        // 只在「誤按完成再取消」情境（真實完成數 < 雲端記錄）才往下修正
        // 不因為任務被刪除/移除而壓低（那些完成是真實發生過的）
        if (_trueDoneToday < lotteryState.todayDone) {
          lotteryState.todayDone = Math.max(minDone, _trueDoneToday);
        }
      }
      saveLottery();
      if (dot) dot.className = 'sync-dot synced';
      renderEnergyDots();
      renderSandbox();
      renderAll();
      checkMissedReset();
      // Fix: 無論是否觸發換日重置，都要呼叫 checkTaskDates，
      // 確保幾天前就排定「今天」的任務能出現在今日面板
      // （若剛好今天已重置過，runDailyReset 不執行，checkTaskDates 也不會被呼叫）
      checkTaskDates();
      // 雲端資料回來後才初始化例行任務（避免競態）
      initRoutines();
      // ── 資料全部就緒，現在才關閉鎖屏 ──
      closeOwnerLoginOverlay();
      // Show recurring morning dialog if not yet shown today
      maybeShowRecurMorningDialog();
      // 推送本次 init 中任何本地變動（orphan cleanup、checkMissedReset、routines reset 等）
      // 不再強制設 _notesDirty = true；_doSyncToCloud 會自動帶上記憶體中有內容的筆記
      syncToCloud();
    } else {
      // ── 雲端讀取失敗 ──
      if (dot) dot.className = 'sync-dot error';
      const localOk = loadStateLocal();
      if (localOk) {
        // 有本地備份（舊裝置離線）→ 先顯示本地資料，背景重試
        state._initDone = true;
        renderEnergyDots(); renderSandbox(); renderAll();
        checkMissedReset(); checkTaskDates(); initRoutines();
        // 資料從本地恢復，關閉鎖屏後再顯示 toast
        closeOwnerLoginOverlay();
        showToast('⚠️ 雲端讀取失敗，已從本地備份還原');
        maybeShowRecurMorningDialog();
      } else {
        // 新裝置，本地也沒資料 → 關閉鎖屏顯示空介面，繼續背景重試
        closeOwnerLoginOverlay();
        showToast('⏳ 正在連線雲端，請稍候…');
      }

      // ── 背景自動重試，最多 5 次，間隔遞增 ──
      let _retryCount = 0;
      const _retryDelays = [3000, 6000, 10000, 15000, 20000];
      async function _retryLoad() {
        if (!dot || !dot.className.includes('error')) return; // 已成功就停
        _retryCount++;
        if (_retryCount > _retryDelays.length) {
          showToast('❌ 雲端連線失敗，請點同步燈重試');
          return;
        }
        dot.className = 'sync-dot syncing';
        const retryOk = await loadFromCloud();
        if (retryOk) {
          state._initDone = true;
          dot.className = 'sync-dot synced';
          saveLottery();
          renderEnergyDots(); renderSandbox(); renderAll();
          checkMissedReset(); checkTaskDates(); initRoutines();
          closeOwnerLoginOverlay();
          maybeShowRecurMorningDialog();
          syncToCloud();
          showToast('✓ 雲端資料已載入');
        } else {
          dot.className = 'sync-dot error';
          setTimeout(_retryLoad, _retryDelays[_retryCount] || 20000);
        }
      }
      setTimeout(_retryLoad, _retryDelays[0]);
    }
  } // end Firebase ok/fail block
  // Firebase 模式：不再有「沒有 API」的分支，統一走上方 Firebase 流程

  // Logo handlers 統一由 notesRewireLogo() 處理

  // ── One-time cleanup: done tasks without completedAt are orphans from old data.
  // Archive to doneHistory (heatmap safe) then remove from tasks so counter is accurate.
  if (!state.doneHistory) state.doneHistory = [];
  const orphans = state.tasks.filter(t => t.done && !t.completedAt);
  if (orphans.length > 0) {
    orphans.forEach(t => {
      const histKey = String(t.id) + '_nodate';
      if (!state.doneHistory.some(h => h.id === histKey)) {
        state.doneHistory.push({ id: histKey, taskId: t.id, name: t.name, goal: t.goal, energy: t.energy, completedAt: null, recurring: t.recurring || false });
      }
    });
    state.tasks = state.tasks.filter(t => !(t.done && !t.completedAt));
    state.done = state.tasks.filter(t => t.done).length;
    syncToCloud();
  }

  renderEnergyDots();
  initMoodTrack();
  renderTree();
  _flashPageTitle('tree');
  startResetCountdown();
  // 有雲端時跳過這批 render，等雲端資料回來後統一繪製，避免閃爍
  if (!getApiUrl()) {
  renderTasks();
  renderSandbox();
  renderStats();
  renderRewards();
  }
  // 有雲端時：initLottery 只做 localStorage 讀取與日期初始化，不重新渲染
  // （雲端資料回來後會再正確合併並 renderLottery，避免 0/3 → 3/3 的閃爍）
  if (getApiUrl()) {
    const _saved = localStorage.getItem('aethelgard_lottery');
    if (_saved) { try { lotteryState = { ...lotteryState, ...JSON.parse(_saved) }; } catch(e) {} }
    if (lotteryState.todayFlipped === undefined) lotteryState.todayFlipped = 0;
  } else {
    initLottery();
  }
  checkTaskDates();
  // 只有在沒有設定雲端 API 時（本機模式）才在這裡執行換日重置
  // 有雲端的情況已在 loadFromCloud 完成後執行，避免競態
  if (!getApiUrl()) checkMissedReset();

  // App 開著跨日時自動觸發 checkTaskDates，確保排定日期的任務準時出現
  scheduleCheckTaskDates();

  // ── 本機模式（無雲端）的 _initDone 在這裡設定；有雲端的已在 loadFromCloud 後設定 ──
  // ★ 修正：這裡原本沒有真的檢查「是否為無雲端模式」，導致就算目前是 Firebase 模式
  //   且 loadFromCloud() 失敗（_initDone 仍應保持 false，等背景重試成功），這行還是
  //   會在 init() 結尾把 _initDone 強制設回 true，等於把上面 ok/fail 分支辛苦做的
  //   防呆整個繞過去，重新打開「空 state 被寫回雲端覆蓋真實資料」的破口。
  //   現在只有真正沒有 Firebase UID（純本機、從未連上雲端）時才會落到這個 fallback。
  if (!window._fbUid && !state._initDone) state._initDone = true;

  // ── 修復：確保 wishPoints 不低於已分配給願望的點數（防止可用碎片永遠顯示 0）──
  {
    const allocatedTotal = (state.rewards || []).reduce((sum, r) => sum + (r.allocatedPoints || 0), 0);
    if ((state.wishPoints || 0) < allocatedTotal) {
      state.wishPoints = allocatedTotal;
      saveStateLocal();
      if (typeof syncToCloud === 'function') syncToCloud();
    }
  }

  // ── 歷史封存：將一年前的 doneHistory 封存到獨立的 localStorage key ──
  archiveOldHistory();

  // ★ Owner 專用：若這次重整是「離開回來後自動重整」保留下來的畫面狀態，
  //   還原回重整前停留的那一頁（筆記頁的話連標籤/頁碼一起還原）。
  //   訪客模式不還原，維持原本固定回到生命樹頁的行為（見 notes.js visibilitychange）。
  if (window._fbIsOwner === true) {
    try {
      const _raw = sessionStorage.getItem('aethelgard_reload_restore');
      if (_raw) {
        sessionStorage.removeItem('aethelgard_reload_restore');
        const _restoreData = JSON.parse(_raw);
        if (_restoreData && _restoreData.page) {
          if (_restoreData.page === 'notes' && typeof notesFolderData !== 'undefined'
              && typeof _restoreData.notesTab === 'number' && notesFolderData[_restoreData.notesTab]) {
            notesTabIndex = _restoreData.notesTab;
            if (typeof _restoreData.notesPage === 'number') {
              notesFolderData[notesTabIndex].currentPage = _restoreData.notesPage;
            }
          }
          if (typeof showPage === 'function') showPage(_restoreData.page);
        }
      }
    } catch(e) {}
  }
}

// ── Mood Buttons ──
// Energy level cycle: low=⚡充電 mid=🍃輕鬆 high=𖦏專注
const _energyLevelCycle = [
  { level:'low',  label:'⚡ 充電', filter:'charge' },
  { level:'mid',  label:'🍃 輕鬆', filter:'easy'   },
  { level:'high', label:'𖦏 專注', filter:'focus'  },
];
let _currentEnergyIdx = 1; // default: mid

function setEnergySegment(filter) {
  // 更新 state
  state.energyFilter = filter;
  // 同步 _currentEnergyIdx 給 legacy code
  const mapToLevel = { charge:'low', easy:'mid', focus:'high', all:'mid' };
  const lvl = mapToLevel[filter] || 'mid';
  _currentEnergyIdx = _energyLevelCycle.findIndex(e => e.level === lvl);
  if (_currentEnergyIdx < 0) _currentEnergyIdx = 1;
  _syncSegmentedUI(filter);
  _syncStripToState();
  renderTasks();
  // ★ 擴大精力篩選的作用範圍：今日任務面板跟生命樹右欄現在也吃這個篩選，
  //   所以切換時要連同這兩處一起重新渲染，否則畫面不會跟著動。
  renderTodayPanel();
  renderTree();
  const toastMap = { all:'✦ 顯示全部', charge:'⚡ 充電模式', easy:'🍃 輕鬆模式', focus:'𖦏 專注模式' };
  showToast(toastMap[filter] || '');
}
window.setEnergySegment = setEnergySegment;

function _syncSegmentedUI(activeFilter) {
  const ids = ['all','charge','easy','focus'];
  ids.forEach(k => {
    const btn = document.getElementById('eseg-' + k);
    if (!btn) return;
    const isActive = k === activeFilter;
    btn.style.background = isActive ? 'var(--green)' : 'transparent';
    btn.style.color = isActive ? '#fff' : 'var(--text-dim)';
    btn.style.fontWeight = isActive ? '600' : '400';
  });
}

function cycleEnergyLevel() {
  const order = ['all','charge','easy','focus'];
  const cur = state.energyFilter || 'all';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  setEnergySegment(next);
}



function _applyEnergyLevel(e) {
  const label = document.getElementById('energySliderLabel');
  const slider = document.getElementById('energySlider');
  const idxMap = { low:0, mid:1, high:2 };
  if (label) label.textContent = e.label;
  if (slider) slider.value = idxMap[e.level] ?? 1;
  // Apply energy filter
  state.energyFilter = e.filter;
  _syncSegmentedUI(e.filter);
  setMoodLevel(e.level);
  _syncStripToState();
  renderTasks();
}

function renderEnergyDots() {
  const v = state.energy || 0;
  let level = 'mid';
  if (v > 0 && v <= 3)  level = 'low';
  else if (v <= 6)       level = 'mid';
  else if (v <= 10)      level = 'high';
  _currentEnergyIdx = _energyLevelCycle.findIndex(e => e.level === level);
  if (_currentEnergyIdx < 0) _currentEnergyIdx = 1;
  const e = _energyLevelCycle[_currentEnergyIdx];
  const label = document.getElementById('energySliderLabel');
  const slider = document.getElementById('energySlider');
  const idxMap = { low:0, mid:1, high:2 };
  if (label) label.textContent = e.label;
  if (slider) slider.value = idxMap[e.level] ?? 1;
  // Sync segmented UI to current energyFilter
  _syncSegmentedUI(state.energyFilter || 'all');
}

function applyEnergyFilter(level) {
  if (level === 'low') {
    state.energyFilter = 'charge';
  } else if (level === 'mid') {
    state.energyFilter = 'easy';
  } else if (level === 'high') {
    state.energyFilter = 'focus';
  }
  _syncStripToState();
  renderTasks();
}

function updateFilterChips(active) {
  // legacy no-op kept for filterByGoal compatibility
}

function filterTaskType(type) {
  state.taskTypeFilter = type;
  _syncStripToState();
  renderTasks();
}

// ── 三格篩選條 ──────────────────────────────────────────
const _filterDims = {
  freq: {
    options: [
      { key: 'all',       label: '全部',     color: null },
      { key: 'recurring', label: '🔁 重複',  color: null },
      { key: 'once',      label: '單次',     color: null },
    ],
    getState: () => state.taskTypeFilter || 'all',
    setState: v => { state.taskTypeFilter = v; },
    count: (tasks, key) => {
      if (key === 'all')       return tasks.length;
      if (key === 'recurring') return tasks.filter(t => t.recurring).length;
      if (key === 'once')      return tasks.filter(t => !t.recurring && !t.taskDate).length;
      return 0;
    },
  },
  time: {
    options: [
      { key: 'all',       label: '全部',      color: null },
      { key: 'today',     label: '☀ 今日',   color: 'var(--gold)' },
      { key: 'overdue',   label: '⚠ 逾期',   color: 'var(--rose)' },
      { key: 'neglected', label: '💤 久未做', color: null },
      { key: 'scheduled', label: '📅 預期',   color: null },
    ],
    getState: () => state.timeFilter || 'all',
    setState: v => { state.timeFilter = v; },
    count: (tasks, key) => {
      const today = localDateStr();
      if (key === 'all')       return tasks.length;
      if (key === 'today')     return tasks.filter(t => t.scheduledFor === today || t.taskDate === today).length;
      if (key === 'overdue')   return tasks.filter(t => t.scheduledFor && t.scheduledFor < today).length;
      if (key === 'neglected') return tasks.filter(t => isNeglected(t)).length;
      if (key === 'scheduled') return tasks.filter(t => t.taskDate && t.taskDate > today).length;
      return 0;
    },
  },
  energy: {
    options: [
      { key: 'all',    label: '全部',    color: null },
      { key: 'charge', label: '⚡ 充電', color: null },
      { key: 'easy',   label: '🍃 輕鬆', color: null },
      { key: 'focus',  label: '𖦏 專注', color: null },
    ],
    getState: () => state.energyFilter || 'all',
    setState: v => { state.energyFilter = v; },
    count: (tasks, key) => {
      if (key === 'all') return tasks.length;
      return tasks.filter(t => t.energy === key).length;
    },
  },
  goal: {
    get options() {
      const goals = _taskGoalsList();
      return [{ key: 'all', label: '全部', color: null },
        ...goals.map(g => ({ key: g.name, label: (g.icon ? g.icon + ' ' : '') + (g.label || g.name), color: null }))];
    },
    getState: () => state.goalFilter || 'all',
    setState: v => {
      state.goalFilter = v === 'all' ? null : v;
      const label = document.getElementById('filtered-label');
      const clearBtn = document.getElementById('clear-filter-btn');
      if (label) label.textContent = '';
      if (clearBtn) clearBtn.style.display = 'none';
    },
    count: (tasks, key) => {
      if (key === 'all') return tasks.length;
      return tasks.filter(t => t.goal === key).length;
    },
  },
};

let _activeDim = null; // which dim is currently expanded

function _baseActiveTasks() {
  const todayStr = localDateStr();
  let tasks = state.tasks.filter(t => !t.done && !(_isFutureIntervalTask(t, todayStr)));
  if (state.goalFilter) tasks = tasks.filter(t => t.goal === state.goalFilter);
  return tasks;
}

function _countForDim(dim) {
  const def = _filterDims[dim];
  const curKey = def.getState();
  let tasks = _baseActiveTasks();
  // apply the OTHER two dims first
  Object.keys(_filterDims).forEach(d => {
    if (d === dim) return;
    tasks = _applyOneDimFilter(tasks, d, _filterDims[d].getState());
  });
  return def.count(tasks, curKey);
}

function _applyOneDimFilter(tasks, dim, key) {
  const today = localDateStr();
  if (dim === 'freq') {
    if (key === 'recurring') return tasks.filter(t => t.recurring);
    if (key === 'once')      return tasks.filter(t => !t.recurring && !t.taskDate);
  }
  if (dim === 'time') {
    if (key === 'today')     return tasks.filter(t => t.scheduledFor === today || t.taskDate === today);
    if (key === 'overdue')   return tasks.filter(t => t.scheduledFor && t.scheduledFor < today);
    if (key === 'neglected') return tasks.filter(t => isNeglected(t));
    if (key === 'scheduled') return tasks.filter(t => t.taskDate && t.taskDate > today);
  }
  if (dim === 'energy') {
    if (key !== 'all') return tasks.filter(t => t.energy === key);
  }
  if (dim === 'goal') {
    if (key !== 'all') return tasks.filter(t => t.goal === key);
  }
  return tasks;
}

function toggleFilterDim(dim) {
  const expand = document.getElementById('filterExpand');
  if (_activeDim === dim) {
    // collapse
    _activeDim = null;
    expand.style.maxHeight = '0';
    expand.style.opacity = '0';
    _highlightStrip(null);
    return;
  }
  _activeDim = dim;
  _renderSubChips(dim);
  expand.style.maxHeight = '200px';
  expand.style.opacity = '1';
  _highlightStrip(dim);
}

function _highlightStrip(activeDim) {
  ['freq','time','energy','goal'].forEach(d => {
    const cell = document.getElementById('fstrip-' + d);
    if (!cell) return;
    cell.style.background = (d === activeDim) ? 'rgba(74,130,196,0.07)' : '';
  });
}

function _renderSubChips(dim) {
  const def = _filterDims[dim];
  const curKey = def.getState();
  let baseTasks = _baseActiveTasks();
  // apply other dims
  Object.keys(_filterDims).forEach(d => {
    if (d === dim) return;
    baseTasks = _applyOneDimFilter(baseTasks, d, _filterDims[d].getState());
  });

  const chips = def.options.map(opt => {
    const cnt = def.count(baseTasks, opt.key);
    const isActive = curKey === opt.key;
    const colorStyle = opt.color ? `color:${opt.color};border-color:${opt.color};` : '';
    const activeStyle = isActive
      ? `background:rgba(74,130,196,0.09);border-color:var(--green);color:var(--green);`
      : colorStyle;
    return `<div class="filter-chip${isActive ? ' active' : ''}" style="${activeStyle}" onclick="_selectSubChip('${dim}','${opt.key}')">${opt.label} <span style="font-size:10px;opacity:0.65">${cnt}</span></div>`;
  }).join('');
  document.getElementById('filterSubChips').innerHTML = chips;
}

function _selectSubChip(dim, key) {
  _filterDims[dim].setState(key);
  _syncStripToState();
  renderTasks();
  // re-render sub chips so counts update
  _renderSubChips(dim);
}

function _syncStripToState() {
  ['freq','time','energy','goal'].forEach(dim => {
    const def = _filterDims[dim];
    const curKey = def.getState();
    const opt = def.options.find(o => o.key === curKey) || def.options[0];
    const cnt = _countForDim(dim);
    const numEl = document.getElementById('fstrip-' + dim + '-num');
    const valEl = document.getElementById('fstrip-' + dim + '-val');
    if (!numEl || !valEl) return;
    // val label color reflects active filter state
    valEl.style.color = curKey !== 'all'
      ? ((opt && opt.color) ? opt.color : 'var(--green)')
      : 'var(--text-dim)';
    valEl.style.fontWeight = curKey !== 'all' ? '600' : '';
  });
  // re-render sub chips if a dim is open
  if (_activeDim) _renderSubChips(_activeDim);
}

// Override filterEnergy to update chip state correctly (kept for energy dot compatibility)
function filterEnergy(type) {
  state.energyFilter = type;
  renderTasks();
}

function onEnergySliderChange(val) {
  // Legacy: now handled by cycleEnergyLevel
  const levels = ['low','mid','high'];
  const level = levels[parseInt(val)] || 'mid';
  const e = _energyLevelCycle.find(x => x.level === level) || _energyLevelCycle[1];
  _currentEnergyIdx = _energyLevelCycle.indexOf(e);
  _applyEnergyLevel(e);
}

function setMoodLevel(level) {
  const map = { low: 2, mid: 5, high: 9 };
  state.energy = map[level] || 5;
  renderEnergyDots();
  syncToCloud();
}

function initMoodTrack() {
  // Sync slider to saved state on load
  renderEnergyDots();
}

// ── Pages ──
// ── 頁面標題：不再固定佔用頁面頂端空間，改成切換頁面時於右下角
//   短暫浮現、幾秒後自動淡出（見 css .section-title / .section-title.show）。
let _pageTitleFadeTimer = null;
const PAGE_TITLE_SEEN_KEY = 'aethelgard_page_title_seen';
function _flashPageTitle(id) {
  document.querySelectorAll('.page .section-title').forEach(el => el.classList.remove('show'));
  const title = document.querySelector('#page-' + id + ' .section-title');
  if (!title) return;

  // ★ 同一個「重置週期」內，同一頁只閃現一次；過了每日重置時間才會再次出現。
  // 用 getLastResetTimestamp() 當作週期識別碼，記在 localStorage（純 UI 偏好，不需同步到雲端）。
  // 例外：許願池的標題裡藏著「規則說明 ⓘ」可點擊按鈕，平常只有標題閃現/hover 時才摸得到，
  // 如果也套用「一天只出現一次」，之後就完全點不到規則說明了，所以許願池維持每次都閃現。
  if (id !== 'wishzone') {
    const cycleTs = getLastResetTimestamp();
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(PAGE_TITLE_SEEN_KEY) || '{}'); } catch(e) { seen = {}; }
    if (seen[id] === cycleTs) return; // 這個週期已經看過這頁的標題了，不再閃現
    seen[id] = cycleTs;
    try { localStorage.setItem(PAGE_TITLE_SEEN_KEY, JSON.stringify(seen)); } catch(e) {}
  }

  // 用雙重 rAF 確保「先移除再加回」class 的動畫每次都會重新觸發，
  // 即使使用者連續快速切換到同一頁也一樣會淡入一次。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => title.classList.add('show'));
  });
  if (_pageTitleFadeTimer) clearTimeout(_pageTitleFadeTimer);
  _pageTitleFadeTimer = setTimeout(() => {
    title.classList.remove('show');
  }, 2600);

  // 滑鼠移入/觸摸時先不淡出，離開後再重新倒數，避免使用者正要看時就消失
  if (!title._hoverBound) {
    title._hoverBound = true;
    const hold = () => { if (_pageTitleFadeTimer) clearTimeout(_pageTitleFadeTimer); };
    const release = () => {
      if (_pageTitleFadeTimer) clearTimeout(_pageTitleFadeTimer);
      _pageTitleFadeTimer = setTimeout(() => title.classList.remove('show'), 1800);
    };
    title.addEventListener('mouseenter', hold);
    title.addEventListener('touchstart', hold, { passive: true });
    title.addEventListener('mouseleave', release);
    title.addEventListener('touchend', release, { passive: true });
  }
}
window._flashPageTitle = _flashPageTitle;

function showPage(id, skipRender) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mob-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const sideNav = document.getElementById('nav-' + id);
  const mobNav  = document.getElementById('mob-' + id);
  if (sideNav) sideNav.classList.add('active');
  if (mobNav)  mobNav.classList.add('active');
  _flashPageTitle(id);
  if (!skipRender) {
    if (id === 'tree')   { renderTree(); }
    if (id === 'todo')   { renderTodoPage(); }
    if (id === 'tasks')  { renderTasks(); }
    if (id === 'sandbox') { renderSandbox(); }
    if (id === 'stats') {
      // Reset showAll when navigating to stats so it defaults to today-only view
      const doneList = document.getElementById('doneList');
      if (doneList) doneList.dataset.showAll = 'false';
      renderStats();
    }
    if (id === 'wishzone') { renderRewards(); renderLottery(); }
  }
}

// ── Filter ──
// filterEnergy defined above near onEnergySliderChange

function filterByGoal(goal) {
  // Set filter state BEFORE navigating so renderTasks sees the correct value
  state.goalFilter = goal;
  state.energyFilter = 'all';
  state.taskTypeFilter = 'all';
  state.timeFilter = 'all';
  // Pre-set the goal in add modal for convenience
  state.pendingGoalForAdd = goal;

  // ★ 桌面版：留在生命樹頁，直接在右欄顯示該分類的任務細項，不跳轉到任務總覽頁。
  //   手機版完全不受影響，下面維持原本「跳轉到任務頁」的行為。
  if (_isDesktopTaskLayout()) {
    renderTree(); // 重新渲染 ring card 的 active 樣式，並連動更新右欄（見 renderTree 結尾）
    return;
  }

  // Navigate without triggering a render yet
  showPage('tasks', true);
  // Update label
  const label = document.getElementById('filtered-label');
  if (label) label.textContent = '— 篩選：' + goalLabel(goal);
  // Update task type filter chips to show "all" as active
  updateFilterChips('all');
  // Sync flat pills
  if (typeof _syncFlatPills === 'function') _syncFlatPills();
  // Now render once with correct state
  renderTasks();
  renderTree();
}

// ── 桌面版生命樹頁右欄：顯示目前選中分類的任務細項 ──────────────
function _renderTreeRightPanel() {
  const wrap = document.getElementById('treeRightCol');
  if (!wrap) return; // 手機版沒有這個元素，直接結束，無副作用

  if (!state.goalFilter) {
    wrap.innerHTML = `<div class="tree-right-placeholder">👈 點選左邊的目標卡片<br>看看裡面有哪些任務</div>`;
    return;
  }

  const node = treeNodes.find(n => n.key === state.goalFilter);
  const todayStrFilter = localDateStr();
  let activeTasks = state.tasks.filter(t => !t.done && t.goal === state.goalFilter && !_isFutureIntervalTask(t, todayStrFilter));
  let doneTasks   = state.tasks.filter(t =>  t.done && t.goal === state.goalFilter);
  // ★ 套用頂部精力切換器篩選，讓「全/⚡/🍃/𖦏」在生命樹右欄也真的有效果
  // ★ 例外：切到⚡充電（低精力）時，有填「最小行動」的𖦏專注任務不隱藏——
  //   改用保底版本露出，而不是整個消失，避免重複任務因為沒力氣而被永遠跳過。
  if (state.energyFilter && state.energyFilter !== 'all') {
    activeTasks = activeTasks.filter(t => _matchesEnergyFilter(t, state.energyFilter));
    doneTasks   = doneTasks.filter(t => _matchesEnergyFilter(t, state.energyFilter));
  }
  const listHtml = _buildTaskListHTML(activeTasks, doneTasks, true);

  wrap.innerHTML = `
    <div class="tree-right-header">
      <span style="color:${node ? node.ringColor : 'inherit'}">${node ? node.icon : ''} ${escHtml(node ? node.label : goalLabel(state.goalFilter))}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="fpill${isSimpleTaskView() ? ' fpill-active' : ''}" onclick="toggleSimpleTaskView()" title="切換簡潔／詳細顯示：簡潔模式會隱藏右側的標籤與徽章">🧹 簡潔</span>
        <button class="btn-ghost-green btn-add-task-right" onclick="openAddTask()" title="新增任務" style="margin:0;padding:4px 12px;font-size:11px;white-space:nowrap">＋<span class="btn-add-task-right-label"> 新增任務</span></button>
      </div>
    </div>
    <div class="tree-right-list">${listHtml}</div>
  `;
}
window._renderTreeRightPanel = _renderTreeRightPanel;

// ── Daily Goal Context Menu ──────────────────────────────
function openDailyGoalCtx(e, key, refEl) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const n = treeNodes.find(x => x.key === key);
  if (!n) return;

  // Remove any existing ctx
  const old = document.getElementById('dailyGoalCtx');
  if (old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'dailyGoalCtx';
  menu.style.cssText = `
    position:fixed;z-index:9999;
    background:var(--bg2);border:1px solid var(--border);
    border-radius:14px;padding:16px 18px;
    box-shadow:0 12px 36px rgba(58,110,165,0.18);
    min-width:200px;animation:modalIn 0.18s ease;
    display:flex;flex-direction:column;gap:12px;
  `;

  menu.innerHTML = `
    <div style="font-size:13px;color:var(--text);font-weight:500">${n.icon} ${n.label} — 每日目標</div>
    <div style="font-size:11px;color:var(--text-faint);line-height:1.5">今天完成幾件算「完整的一天」？<br>圓環會以此為滿格基準。</div>
    <div style="display:flex;align-items:center;gap:10px">
      <button onclick="_dailyGoalAdj('${key}',-1)" class="btn-adj">−</button>
      <div id="dailyGoalVal-${key}" style="font-family:'DM Serif Display',serif;font-size:28px;color:${n.ringColor};min-width:32px;text-align:center">${n.dailyGoal}</div>
      <button onclick="_dailyGoalAdj('${key}',+1)" class="btn-adj">＋</button>
    </div>
    <button onclick="_dailyGoalSave('${key}')" class="btn-save-green" style="padding:8px 0">儲存</button>
  `;

  document.body.appendChild(menu);

  // Position: near the card or near cursor
  const rect = refEl ? refEl.getBoundingClientRect() : (e ? { left: e.clientX, top: e.clientY, bottom: e.clientY } : { left: window.innerWidth/2 - 100, top: window.innerHeight/2, bottom: window.innerHeight/2 });
  let left = rect.left;
  let top  = rect.bottom + 8;
  // Keep in viewport
  setTimeout(() => {
    const mw = menu.offsetWidth || 220;
    const mh = menu.offsetHeight || 160;
    if (left + mw > window.innerWidth - 8)  left = window.innerWidth - mw - 8;
    if (top  + mh > window.innerHeight - 8) top  = rect.top - mh - 8;
    if (left < 8) left = 8;
    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';
  }, 0);

  // Close on outside click
  setTimeout(() => document.addEventListener('click', _dailyGoalOutside, { once: true }), 0);
}
window.openDailyGoalCtx = openDailyGoalCtx;

function _dailyGoalAdj(key, delta) {
  const n = treeNodes.find(x => x.key === key);
  if (!n) return;
  n.dailyGoal = Math.max(1, Math.min(20, (n.dailyGoal || 1) + delta));
  const el = document.getElementById('dailyGoalVal-' + key);
  if (el) el.textContent = n.dailyGoal;
}
window._dailyGoalAdj = _dailyGoalAdj;

function _dailyGoalSave(key) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('aethelgard_dailyGoals') || '{}'); } catch(e) {}
  const n = treeNodes.find(x => x.key === key);
  if (n) saved[key] = n.dailyGoal;
  try { localStorage.setItem('aethelgard_dailyGoals', JSON.stringify(saved)); } catch(e) {}
  const old = document.getElementById('dailyGoalCtx');
  if (old) old.remove();
  renderTree();
  showToast(`✓ ${n ? n.label : key} 每日目標設為 ${n ? n.dailyGoal : ''}`);
}
window._dailyGoalSave = _dailyGoalSave;

function _dailyGoalOutside(e) {
  const menu = document.getElementById('dailyGoalCtx');
  if (menu && !menu.contains(e.target)) menu.remove();
}


function openAddTask() {
  // Pre-fill goal from active filter or pending goal
  const activeGoal = state.pendingGoalForAdd || state.goalFilter || null;
  const activeEnergy = (state.energyFilter && state.energyFilter !== 'all') ? state.energyFilter : 'easy';
  _setGoalBtn(activeGoal || '技能');
  _setEnergyBtn(activeEnergy);
  if (state.pendingGoalForAdd) state.pendingGoalForAdd = null;
  // Reset recurring
  _recurState['new'] = 'off';
  _applyRecurUI('new', 'off');
  document.getElementById('addModal').classList.add('open');
  setTimeout(() => document.getElementById('newTaskName').focus(), 50);
}

function openAddTaskForToday() {
  // 與 openAddTask 相同的狀態重置，避免上次開啟後的 goal/energy/recur 殘留
  const activeGoal = state.pendingGoalForAdd || state.goalFilter || '技能';
  _setGoalBtn(activeGoal);
  _setEnergyBtn('easy');
  if (state.pendingGoalForAdd) state.pendingGoalForAdd = null;
  _recurState['new'] = 'off';
  _applyRecurUI('new', 'off');
  // Pre-fill today's date so it auto-appears in today panel
  document.getElementById('newTaskDate').value = localDateStr();
  document.getElementById('addModal').classList.add('open');
  setTimeout(() => document.getElementById('newTaskName').focus(), 50);
  state._addTaskForToday = true;
}

function clearGoalFilter() {
  state.goalFilter = null;
  state.taskTypeFilter = 'all';
  state.timeFilter = 'all';
  const label = document.getElementById('filtered-label');
  if (label) label.textContent = '';
  const clearBtn = document.getElementById('clear-filter-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  if (typeof _syncFlatPills === 'function') _syncFlatPills();
  renderTasks();
  renderTree();
}

// Helper: 任務是否符合目前的精力篩選（charge/easy/focus）。
// 例外：篩選為 charge（⚡低精力）時，有填「最小行動」的重複任務不隱藏，
// 讓沒力氣的當下還是能看到保底版本，而不是整個消失、隔天堆積。
function _matchesEnergyFilter(t, filterKey) {
  if (t.energy === filterKey) return true;
  if (filterKey === 'charge' && t.recurring && t.minimalAction) return true;
  return false;
}

// Helper: is this an interval-recurring clone scheduled for a future date?
function _isFutureIntervalTask(t, todayStr) {
  if (!t._intervalScheduled && !(t.recurring && t.recurMode === 'interval')) return false;
  if (!t.scheduledFor) return false;
  if (t.scheduledFor > todayStr) return true;
  // Clone scheduled for today: hide it if the original task is still alive and marked _intervalCompleted
  // (original and clone coexist until daily reset — avoid showing duplicate task names)
  const originalStillAlive = state.tasks.some(x => x._intervalCloneId === t.id && x._intervalCompleted);
  return originalStillAlive;
}

// ── Tasks ──
// ── 共用：依排序規則產生任務清單 HTML（卡片 + 今日已完成收合區）──────────────
// renderTasks()（任務頁）跟 _renderTreeRightPanel()（生命樹頁右欄）都呼叫這個函式，
// 確保兩邊任務卡片的排序規則、外觀完全一致，不會各寫一份慢慢長歪。
function _buildTaskListHTML(activeTasks, doneTasks, compact) {
  activeTasks = activeTasks.slice(); // 複製一份，不動到傳進來的原陣列
  // 排序：
  // 1. neglected 優先
  // 2. 無日期非重複任務
  // 3. 有日期非重複任務（由早到晚）
  // 4. 重複任務（interval 天數由多到少，每天置最下）
  activeTasks.sort((a, b) => {
    // 1. neglected 優先
    const aN = isNeglected(a) ? 0 : 1;
    const bN = isNeglected(b) ? 0 : 1;
    if (aN !== bN) return aN - bN;

    // 2. 重複任務排最後
    const aRec = a.recurring ? 1 : 0;
    const bRec = b.recurring ? 1 : 0;
    if (aRec !== bRec) return aRec - bRec;

    // 3. 同為重複任務：interval 天數多的靠上，每天（daily）置最下
    if (a.recurring && b.recurring) {
      const aIsDaily = a.recurMode !== 'interval';
      const bIsDaily = b.recurMode !== 'interval';
      if (aIsDaily !== bIsDaily) return aIsDaily ? 1 : -1;
      if (!aIsDaily && !bIsDaily) {
        const aInt = a.recurInterval || 1;
        const bInt = b.recurInterval || 1;
        if (aInt !== bInt) return bInt - aInt;
      }
      return 0;
    }

    // 4. 同為非重複任務：無日期靠上，有日期由早到晚
    const aHasDate = a.taskDate ? 1 : 0;
    const bHasDate = b.taskDate ? 1 : 0;
    if (aHasDate !== bHasDate) return aHasDate - bHasDate;
    if (a.taskDate && b.taskDate && a.taskDate !== b.taskDate) {
      return a.taskDate.localeCompare(b.taskDate);
    }
    return 0;
  });

  let html = '';
  if (activeTasks.length === 0) {
    html += '<div style="text-align:center;padding:24px;color:var(--text-faint);font-size:13px;font-style:italic">沒有符合條件的任務。也許這就是你休息的訊號？</div>';
  } else {
    html += activeTasks.map(t => taskHTML(t, compact)).join('');
  }

  // Done section — only show today's completed tasks; past completed tasks belong in 成長軌跡
  const todayDoneTasks = doneTasks.filter(t => t.completedAt === localDateStr(new Date(getLastResetTimestamp())));
  if (todayDoneTasks.length > 0) {
    const isOpen = state.doneOpen;
    html += `
      <div class="done-section-header" onclick="toggleDoneSection()">
        <span class="done-toggle-arrow ${isOpen ? 'open' : ''}">▶</span>
        今日已完成 ${todayDoneTasks.length} 件
        <span style="font-size:10px;color:var(--text-faint);margin-left:4px">（點擊 ✓ 可取消勾選）</span>
      </div>
      <div class="done-tasks-wrap ${isOpen ? 'open' : ''}" id="doneTasksWrap">
        ${todayDoneTasks.map(t => taskHTML(t, compact)).join('')}
      </div>`;
  }
  return html;
}

function renderTasks() {
  // ── 桌面版：首次進入任務頁時，預設選第一個分類 + 只看今日 ──
  // （手機版 _isDesktopTaskLayout() 為 false，這段邏輯完全不會執行，行為與改版前一致）
  if (_isDesktopTaskLayout() && !state.goalFilter) {
    const goals = (state.goals && state.goals.length) ? state.goals : [{ name: '技能' }, { name: '自我' }, { name: '日常' }];
    state.goalFilter = goals[0].name;
    if (state.taskTypeFilter !== 'recurring' && state.timeFilter !== 'overdue') {
      state.timeFilter = 'today';
    }
  }

  // Show/hide the "clear filter" button
  const clearBtn = document.getElementById('clear-filter-btn');
  if (clearBtn) clearBtn.style.display = state.goalFilter ? 'inline-flex' : 'none';

  const list = document.getElementById('taskList');
  const simpleBtn = document.getElementById('simpleViewToggleBtn');
  if (simpleBtn) simpleBtn.classList.toggle('fpill-active', isSimpleTaskView());
  const todayStrFilter = localDateStr();
  // Hide interval-scheduled clones that haven't arrived yet
  let activeTasks = state.tasks.filter(t => !t.done && !(_isFutureIntervalTask(t, todayStrFilter)));
  let doneTasks   = state.tasks.filter(t =>  t.done);
  // Energy filter: 'mid' shows flow AND light
  if (state.energyFilter && state.energyFilter !== 'all') {
    activeTasks = activeTasks.filter(t => t.energy === state.energyFilter);
  }
  // Task type filter (freq dim)
  activeTasks = _applyOneDimFilter(activeTasks, 'freq', state.taskTypeFilter || 'all');
  // Time filter (time dim)
  activeTasks = _applyOneDimFilter(activeTasks, 'time', state.timeFilter || 'all');
  if (state.goalFilter) {
    activeTasks = activeTasks.filter(t => t.goal === state.goalFilter);
    doneTasks   = doneTasks.filter(t => t.goal === state.goalFilter);
  }
  // 排序：
  // 1. neglected 優先
  // 2. 無日期非重複任務
  // 3. 有日期非重複任務（由早到晚）
  // 4. 重複任務（interval 天數由多到少，每天置最下）
  const html = _buildTaskListHTML(activeTasks, doneTasks);

  list.innerHTML = html;
  // update strip counts
  if (typeof _syncStripToState === 'function') _syncStripToState();
  // sync flat pills
  if (typeof _syncFlatPills === 'function') _syncFlatPills();
  // 桌面：分類欄 / 右上角篩選鈕 / 全分類今日進度條（手機上對應 DOM 為 display:none，呼叫無副作用）
  _renderTaskCatNav();
  _syncDesktopPills();
  _renderTaskGlobalProgress();
  // 手機：為每個有 breakdown 的任務綁定觸控拖曳
  if (window.matchMedia('(pointer: coarse)').matches) {
    state.tasks.filter(t => t.steps && t.steps.length > 0).forEach(t => {
      _wireStepTouchDrag(t.id);
    });
    // 為每個任務綁定長按 context menu（取代桌機右鍵）
    _wireTaskLongPress();
  }
}

// ── 桌面版任務頁：分類欄 / 篩選鈕 / 全分類今日進度條 ──────────────
function _isDesktopTaskLayout() {
  return window.matchMedia('(min-width: 681px)').matches;
}

function _taskGoalsList() {
  // treeNodes 是分類命名（icon/label）的唯一真相來源；state.goals 目前整個專案
  // 沒有任何地方賦值過，只是舊版留下的防呆 fallback，這裡改成優先讀 treeNodes，
  // 這樣分類改名/換 icon 只需要改 treeNodes 一處，這裡會自動跟著更新。
  if (typeof treeNodes !== 'undefined' && treeNodes.length) {
    return treeNodes.map(n => ({ name: n.key, icon: n.icon, label: n.label }));
  }
  return (state.goals && state.goals.length) ? state.goals : [
    { name: '技能', icon: '🚩', label: '限時活動' },
    { name: '自我', icon: '💎', label: '突破素材' },
    { name: '日常', icon: '🧭', label: '每日委託' }
  ];
}

function _renderTaskCatNav() {
  const wrap = document.getElementById('taskCatNav');
  const labelEl = document.getElementById('taskDesktopCatLabel');
  if (!wrap) return; // 該頁尚未渲染（不應發生，僅防呆）
  const goals = _taskGoalsList();
  const todayStrFilter = localDateStr();
  wrap.innerHTML = goals.map(g => {
    const cnt = state.tasks.filter(t => !t.done && t.goal === g.name && !_isFutureIntervalTask(t, todayStrFilter)).length;
    const isActive = state.goalFilter === g.name;
    const icon = g.icon || '';
    return `<div class="task-cat-row${isActive ? ' active' : ''}" onclick="taskCatNavSelect('${g.name}')">
      <span>${icon} ${escHtml(g.label || g.name)}</span><span class="task-cat-count">${cnt}</span>
    </div>`;
  }).join('');
  if (labelEl) {
    const activeGoal = goals.find(g => g.name === state.goalFilter);
    labelEl.textContent = activeGoal ? `${activeGoal.icon || ''} ${activeGoal.label || activeGoal.name}` : (state.goalFilter || '');
  }
}

function taskCatNavSelect(goalName) {
  // 重用既有 flatSetGoal（會重置 taskTypeFilter / timeFilter 為 all 並重新渲染）
  flatSetGoal(goalName);
  // 桌面版：切換分類後預設只看「今日」
  if (_isDesktopTaskLayout()) {
    state.timeFilter = 'today';
    renderTasks();
  }
}
window.taskCatNavSelect = taskCatNavSelect;

function flatSetTimeDesktop(key) {
  if (key === 'today') {
    const isActive = state.timeFilter === 'today';
    state.timeFilter = isActive ? 'all' : 'today';
    state.taskTypeFilter = 'all';
  } else if (key === 'recurring') {
    const isActive = state.taskTypeFilter === 'recurring';
    state.taskTypeFilter = isActive ? 'all' : 'recurring';
    state.timeFilter = 'all';
  } else if (key === 'overdue') {
    const isActive = state.timeFilter === 'overdue';
    state.timeFilter = isActive ? 'all' : 'overdue';
    state.taskTypeFilter = 'all';
  }
  renderTasks();
}
window.flatSetTimeDesktop = flatSetTimeDesktop;

function _syncDesktopPills() {
  const time = state.taskTypeFilter === 'recurring' ? 'recurring'
             : state.timeFilter === 'overdue' ? 'overdue'
             : state.timeFilter === 'today' ? 'today' : 'none';
  const tEl = document.getElementById('fpill-time-today2');
  const rEl = document.getElementById('fpill-time-recurring2');
  const oEl = document.getElementById('fpill-time-overdue2');
  if (tEl) tEl.classList.toggle('fpill-active', time === 'today');
  if (rEl) rEl.classList.toggle('fpill-active', time === 'recurring');
  if (oEl) oEl.classList.toggle('fpill-active', time === 'overdue');
}

function _renderTaskGlobalProgress() {
  const el = document.getElementById('taskGlobalProgress');
  if (!el) return;
  const today = localDateStr();
  const todayAll = state.tasks.filter(t => t.scheduledFor === today || t.taskDate === today);
  if (todayAll.length === 0) { el.innerHTML = ''; return; }
  const doneCount = todayAll.filter(t => t.done).length;
  const pct = Math.round(doneCount / todayAll.length * 100);
  el.innerHTML = `
    <div class="task-global-progress-label">今日總進度 · 全分類</div>
    <div class="task-global-progress-row">
      <div class="task-global-progress-track"><div class="task-global-progress-fill" style="width:${pct}%"></div></div>
      <span class="task-global-progress-count">${doneCount}/${todayAll.length}</span>
    </div>`;
}

// ── 扁平 Pill 篩選 ──────────────────────────────────────
function _syncFlatPills() {
  const goal = state.goalFilter || 'all';
  const time = state.taskTypeFilter === 'recurring' ? 'recurring'
             : (state.timeFilter === 'overdue' ? 'overdue' : 'none');

  ['all','技能','自我','日常'].forEach(k => {
    const el = document.getElementById('fpill-goal-' + k);
    if (!el) return;
    el.classList.toggle('fpill-active', k === goal);
  });
  const rEl = document.getElementById('fpill-time-recurring');
  const oEl = document.getElementById('fpill-time-overdue');
  if (rEl) rEl.classList.toggle('fpill-active', time === 'recurring');
  if (oEl) oEl.classList.toggle('fpill-active', time === 'overdue');
}

function flatSetGoal(goal) {
  state.goalFilter = goal === 'all' ? null : goal;
  // 切分類時清掉時間快速篩，避免組合結果令人困惑
  state.taskTypeFilter = 'all';
  state.timeFilter = 'all';
  _syncFlatPills();
  renderTasks();
  // 同步 clear-filter-btn
  const label = document.getElementById('filtered-label');
  const clearBtn = document.getElementById('clear-filter-btn');
  if (label) label.textContent = '';
  if (clearBtn) clearBtn.style.display = 'none';
}
window.flatSetGoal = flatSetGoal;

function flatSetTime(key) {
  // 再點同一個 pill 就取消
  if (key === 'recurring') {
    const isActive = state.taskTypeFilter === 'recurring';
    state.taskTypeFilter = isActive ? 'all' : 'recurring';
    state.timeFilter = 'all';
  } else if (key === 'overdue') {
    const isActive = state.timeFilter === 'overdue';
    state.timeFilter = isActive ? 'all' : 'overdue';
    state.taskTypeFilter = 'all';
  }
  _syncFlatPills();
  renderTasks();
}
window.flatSetTime = flatSetTime;

function taskHTML(t, compact) {
  const eIcon = energyIcons[t.energy] || '●';
  const eLabel = energyLabels[t.energy] || t.energy;
  const steps = t.steps || [];
  const hasSteps = steps.length > 0;
  const isOpen = t._breakdownOpen || false;
  // 簡潔顯示模式：隱藏右側標籤/徽章雜訊（能量標籤、日期、逾期、重複∞、久未完成、備忘圖示），
  // 只留勾選框、名稱、內容本身跟「⋯」更多選單。純顯示偏好，跟裝置綁定，不需要同步到雲端。
  const simple = isSimpleTaskView();

  // Goal color map
  const goalColorMap = { '技能': '#D4608A', '自我': '#C9A227', '日常': '#3A6EA5' };
  const taskNameColor = goalColorMap[t.goal] || 'var(--text)';

  // Due date / status logic
  const todayStr = localDateStr();
  // 有效今日：重置時間決定，00:00~重置時間之間仍屬上個週期
  const effectiveTodayStr = localDateStr(new Date(getLastResetTimestamp()));
  const isToday = t.scheduledFor === todayStr;
  const isCancelled = t.status === 'cancelled';
  // 逾期：scheduledFor 比有效今日舊（即上個重置週期之前的），且非預排
  // 上個週期標記的任務（4/30的任務在4/30 04:00前都不算逾期，過了才算）
  const isOverdue = t.scheduledFor && t.scheduledFor < effectiveTodayStr && !t.done && !isCancelled
    && !isPreScheduled(t);

  // 預排：在 00:00~重置時間 之間標記的任務，銀色條提示「等待重置後生效」
  const isPreSched = !t.done && !isCancelled && isPreScheduled(t);

  // Side stripe color: overdue = red, pre-scheduled = silver, today-marked = gold, default = blue
  let stripeColor, stripeTitle, stripeOnClick;
  if (t.done) {
    stripeColor = 'rgba(130,154,177,0.25)';
    stripeOnClick = '';
    stripeTitle = '';
  } else if (isOverdue) {
    stripeColor = 'var(--rose)';
    stripeTitle = '逾期 — 點擊取消標記';
    stripeOnClick = `onclick="setTaskStatus(${t.id},'none');event.stopPropagation()"`;
  } else if (isPreSched) {
    // 預排（00:00~重置時間）：銀色條，重置後自動變金黃
    stripeColor = 'rgba(160,170,185,0.75)';
    stripeTitle = '預排於重置後執行 — 點擊取消';
    stripeOnClick = `onclick="setTaskStatus(${t.id},'none');event.stopPropagation()"`;
  } else if (isToday || isScheduledInCurrentCycle(t)) {
    // Marked today: gold stripe, click to un-mark
    stripeColor = '#C9A227';
    stripeTitle = '今日處理中 — 點擊取消';
    stripeOnClick = `onclick="setTaskStatus(${t.id},'none');event.stopPropagation()"`;
  } else {
    // Default: blue stripe, click to mark as today
    stripeColor = 'rgba(58,110,165,0.55)';
    stripeTitle = '點擊標記為今日處理';
    stripeOnClick = `onclick="setTaskStatus(${t.id},'today');event.stopPropagation()"`;
  }

  const stepsHTML = hasSteps ? steps.map((s, i) => {
    const stepName = typeof s === 'object' ? (s.name || '') : s;
    const stepDone = typeof s === 'object' ? !!s.done : false;
    return `
    <div class="breakdown-step${stepDone ? ' step-done-row' : ''}" id="bstep-${t.id}-${i}" draggable="true"
      ondragstart="stepDragStart(event,${t.id},${i})"
      ondragover="stepDragOver(event,${t.id},${i})"
      ondrop="stepDrop(event,${t.id},${i})"
      ondragend="stepDragEnd(event,${t.id})">
      <span class="step-drag-handle" title="拖曳排序">⠿</span>
      <div class="step-check${stepDone ? ' checked' : ''}" onclick="toggleStep(event,${t.id},${i})" title="${stepDone ? '取消完成' : '標記為完成'}">${stepDone ? '✓' : ''}</div>
      <input class="step-name${stepDone ? ' step-done' : ''}" type="text" value="${stepName.replace(/"/g,'&quot;')}"
        onblur="updateStepName(${t.id},${i},this.value)"
        onkeydown="if(event.key==='Enter'){this.blur()}"
        onclick="event.stopPropagation()">
      <span class="step-del" onclick="deleteStep(event,${t.id},${i})" title="刪除步驟">×</span>
    </div>`;
  }).join('') : '';

  const doneCount = hasSteps ? steps.filter(s => typeof s === 'object' ? s.done : false).length : 0;
  const progressPct = hasSteps && steps.length > 0 ? Math.round(doneCount / steps.length * 100) : 0;

  const breakdownHTML = hasSteps ? `
  <div class="task-breakdown${isOpen ? ' open' : ''}" id="breakdown-${t.id}">
    <div class="task-breakdown-inner">
      <div class="breakdown-header">🔀 拆解流程</div>
      <div class="breakdown-progress">
        <div class="breakdown-progress-bar"><div class="breakdown-progress-fill" style="width:${progressPct}%"></div></div>
        <span class="breakdown-progress-label">${doneCount}/${steps.length} 完成</span>
      </div>
      <div class="breakdown-steps" id="bsteps-${t.id}">${stepsHTML}</div>
      <button class="breakdown-add-btn" onclick="addStep(event,${t.id})">＋ 新增步驟</button>
    </div>
  </div>` : '';

  const todayClass = isToday ? ' is-today' : isOverdue ? ' is-overdue' : '';
  const neglected = isNeglected(t);
  const neglectClass = neglected ? ' neglected' : '';

  const tagsHTML = `
    <div class="task-meta">
      <span class="tag tag-energy" title="能量：${eLabel}"><span class="tag-icon">${eIcon}</span><span class="tag-label"> ${eLabel}</span></span>
      ${t.postponed >= 3 ? '<span class="tag" title="已多次延期" style="border-color:rgba(200,120,120,0.4);color:var(--rose);background:rgba(200,120,120,0.06)"><span class="tag-icon">⚠</span><span class="tag-label"> 已多次延期</span></span>' : ''}
      ${t.recurring && t.recurMode === 'interval' ? `<span class="tag" title="每${t.recurInterval || '?'}天重複" style="border-color:rgba(110,174,224,0.4);color:var(--sky);background:rgba(110,174,224,0.07)"><span class="tag-icon">🔁</span><span class="tag-label"> 每${t.recurInterval || '?'}天</span></span>` : t.recurring ? '<span class="tag" title="重複任務" style="border-color:rgba(110,174,224,0.4);color:var(--sky);background:rgba(110,174,224,0.07)"><span class="tag-icon">🔁</span><span class="tag-label"> 重複</span></span>' : ''}
      ${isOverdue && !t.done ? '<span class="tag" title="逾期" style="border-color:rgba(192,86,90,0.4);color:var(--rose);background:rgba(192,86,90,0.07)"><span class="tag-icon">⚠</span><span class="tag-label"> 逾期</span></span>' : ''}
      ${t.taskDate && !t.done ? `<span class="tag" title="日期：${t.taskDate}（點擊修改）" style="border-color:rgba(130,154,177,0.35);color:var(--sky);background:rgba(130,154,177,0.07);cursor:pointer" onclick="event.stopPropagation();openDateTagPicker(event,${t.id})"><span class="tag-icon">📅</span><span class="tag-label"> ${t.taskDate}</span></span>` : ''}
    </div>`;

  // 倒數天數 badge：title 提示同時顯示「實際日期」跟「剩幾天」，
  // 滑鼠移上去不會只看到數字，還能看到是哪一天到期
  let countdownHTML = '';
  if (t.taskDate && !t.done) {
    const today = localDateStr();
    const diff = Math.round((new Date(t.taskDate) - new Date(today)) / 86400000);
    const diffLabel = diff === 0 ? '今天截止' : diff > 0 ? `剩 ${diff} 天` : `逾 ${-diff} 天`;
    const diffCompact = diff === 0 ? '今天' : diff > 0 ? `${diff}` : `-${-diff}`;
    const diffColor = diff < 0 ? 'var(--rose)' : diff <= 2 ? '#C9A227' : 'var(--text-faint)';
    countdownHTML = `<span class="countdown-badge" title="${t.taskDate}（${diffLabel}）" style="font-size:11px;color:${diffColor};white-space:nowrap">⏳<span class="countdown-num">${diffCompact}</span></span>`;
  }

  return `
  <div class="task-item${t.done ? ' done' : ''}${todayClass}${neglectClass}" id="task-${t.id}" style="flex-direction:column;padding:0;gap:0">
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;width:100%">
      <div class="task-stripe" style="background:${stripeColor}" title="${stripeTitle}" ${stripeOnClick}></div>
      <div class="task-check${t.done ? ' checked' : ''}" onclick="toggleTask(${t.id})" style="margin-top:1px;flex-shrink:0">${t.done ? '✓' : ''}</div>
      <div class="task-body" style="flex:1;min-width:0">
        <div class="task-name${hasSteps ? ' collapsible' : ''}" onclick="${hasSteps ? `toggleBreakdown(${t.id})` : ''}" style="color:${t.done ? 'var(--text-dim)' : taskNameColor}">
          ${escHtml(t.name)}
          ${hasSteps ? `<span class="task-collapse-arrow${isOpen ? ' open' : ''}">▶</span>` : ''}
        </div>
        ${t.meaning ? `<div class="task-meaning">${escHtml(t.meaning)}</div>` : ''}
        ${t.note ? `<div class="task-note-preview" style="font-size:12px;color:var(--gold);margin-top:4px;padding:4px 8px;background:rgba(200,169,110,0.08);border-radius:6px;border-left:2px solid var(--gold);line-height:1.5">📝 ${escHtml(t.note)}</div>` : ''}
        ${t.minimalAction ? `<div class="task-minimal-action-preview" style="font-size:12px;color:var(--sky);margin-top:4px;padding:4px 8px;background:${state.energyFilter === 'charge' ? 'rgba(110,174,224,0.14)' : 'rgba(110,174,224,0.07)'};border-radius:6px;border-left:2px solid var(--sky);line-height:1.5;${state.energyFilter === 'charge' ? 'font-weight:600' : ''}">🪫 沒力氣時：${escHtml(t.minimalAction)}</div>` : ''}
        ${simple || compact ? '' : tagsHTML}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
        ${simple ? '' : `
        <div style="display:flex;flex-direction:row;gap:6px;align-items:center">
          ${countdownHTML}
          ${t.recurring ? `<span class="recur-infinity-badge" title="${t.recurMode === 'interval' ? `重複任務 — 每${t.recurInterval || '?'}天` : '重複任務 — 每日'}" style="font-size:14px;line-height:1;color:var(--sky);opacity:0.65">∞</span>` : ''}
          ${neglected ? `<span class="neglect-badge" title="久未完成 — 點擊重新計算天數" onclick="event.stopPropagation();resetNeglect(${t.id})">⏳<span class="tag-label"> 久未完成</span></span>` : ''}
          <div onclick="openNoteModal(${t.id})" id="noteBtn-${t.id}" class="task-icon-btn" style="opacity:${t.note ? 1 : 0.3};color:${t.note ? 'var(--gold)' : 'inherit'}" title="${t.note ? '查看/編輯備忘' : '新增備忘'}">📝</div>
        </div>
        ${compact ? tagsHTML : ''}
        `}
        <div onclick="openCtxMenu(event,${t.id})" class="task-icon-btn" style="font-size:16px;opacity:0.3;line-height:1;letter-spacing:1px" title="更多">⋯</div>
      </div>
    </div>
    ${breakdownHTML}
  </div>`;
}

// ── 簡潔顯示模式：右側標籤/徽章一鍵隱藏、需要時再切回來看 ──────────────
// 純顯示偏好，跟這台裝置綁定（不寫進 state、不同步到雲端），所以不會因為
// 多裝置同步而互相干擾，也不會佔用 Firestore 文件空間。
const SIMPLE_TASK_VIEW_KEY = 'aethelgard_simple_task_view';
function isSimpleTaskView() {
  return localStorage.getItem(SIMPLE_TASK_VIEW_KEY) === '1';
}
function toggleSimpleTaskView() {
  const next = !isSimpleTaskView();
  localStorage.setItem(SIMPLE_TASK_VIEW_KEY, next ? '1' : '0');
  renderTasks();
  if (typeof _renderTreeRightPanel === 'function') _renderTreeRightPanel();
}
window.toggleSimpleTaskView = toggleSimpleTaskView;

function toggleDoneSection() {
  state.doneOpen = !state.doneOpen;
  const wrap = document.getElementById('doneTasksWrap');
  if (wrap) {
    const arrow = wrap.previousElementSibling?.querySelector('.done-toggle-arrow');
    if (state.doneOpen) {
      wrap.style.maxHeight = wrap.scrollHeight + 'px';
      setTimeout(() => { if (wrap.classList.contains('open')) wrap.style.maxHeight = 'none'; }, 320);
      wrap.classList.add('open');
      if (arrow) arrow.classList.add('open');
    } else {
      wrap.style.maxHeight = wrap.scrollHeight + 'px';
      requestAnimationFrame(() => { wrap.style.maxHeight = '0'; });
      wrap.classList.remove('open');
      if (arrow) arrow.classList.remove('open');
    }
  } else {
    renderTasks();
  }
}

// ── Task Status (Today / Cancel / Overdue) ──
function setTaskStatus(id, status) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  // 注意：刻意用 localDateStr()（時鐘日期）而非 effectiveToday，
  // 00:00~重置時間 期間使用者可能在安排「隔天（重置後）」的任務，應保留此行為。
  const todayStr = localDateStr();
  if (status === 'today') {
    t.scheduledFor = todayStr;
    t.status = 'active';
    t.scheduledAt = Date.now(); // 記錄標記時間戳，防止在 00:00~重置時間 之間被誤判為逾期
    showToast('◉ 已標記為今日處理');
  } else if (status === 'none') {
    t.scheduledFor = null;
    t.scheduledAt = null;
    // 若任務有 taskDate，用 'cancelled' 防止 checkTaskDates 重新自動排進今日
    t.status = t.taskDate ? 'cancelled' : null;
    showToast('已取消標記');
  } else if (status === 'cancelled') {
    t.status = 'cancelled';
    t.scheduledFor = null;
    t.scheduledAt = null;
    showToast('✕ 已取消今日處理');
  }
  renderTasks();
  renderTodayPanel();
  // ★ 補上 renderTree()：三大分類卡片的「今日未完成數量」紅色提示，以及生命樹右欄
  //   （顯示目前選中分類任務細項）都是在 renderTree() 裡才會重新渲染。
  //   少了這行，標記/取消今日只會更新任務頁的色條，生命樹頁那兩處會停在舊狀態。
  renderTree();
  // 標記今日是高優先操作，直接寫入不等 debounce，避免重整後消失
  _markSyncWrite();
  _doSyncToCloud();
}



// ── Neglect helpers ──
function getNeglectDays() {
  return parseInt(localStorage.getItem('aethelgard_neglect_days') || '7');
}

function isNeglected(t) {
  if (t.done || t.recurring) return false;
  if (t.taskDate) return false; // 有設定截止日期的任務不計算久未完成
  const days = getNeglectDays();
  const history = state.doneHistory || [];
  // Match by taskId (precise) — history entries store taskId as the original task's numeric id
  const byId = history.filter(h => h.taskId === t.id && h.completedAt);
  // Also match by name for tasks that were recreated / renamed (best-effort fallback)
  const byName = history.filter(h => h.name === t.name && h.completedAt);
  const matches = byId.length > 0 ? byId : byName;
  if (matches.length > 0) {
    matches.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const lastDate = new Date(matches[0].completedAt);
    const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= days;
  }
  // If never completed, check creation date proxy (id timestamp)
  const createdMs = typeof t.id === 'number' && t.id > 1e12 ? t.id : 0;
  if (createdMs > 0) {
    const diffDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
    return diffDays >= days;
  }
  return false;
}

// ── Reset neglect counter (點擊久未完成 badge 重新計算天數) ──
function resetNeglect(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const todayStr = localDateStr();
  // Insert a synthetic history entry with today's date so the counter resets from now
  if (!state.doneHistory) state.doneHistory = [];
  state.doneHistory.push({
    id: 'neglect_reset_' + taskId + '_' + Date.now(),
    taskId: taskId,
    name: t.name,
    goal: t.goal,
    energy: t.energy,
    completedAt: todayStr,
    recurring: false,
    _neglectReset: true
  });
  renderTasks();
  if (typeof _renderTreeRightPanel === 'function') _renderTreeRightPanel();
  syncToCloud();
  showToast('⏳ 已重新計算久未完成天數');
}
window.resetNeglect = resetNeglect;

// ── Today Panel (under Life Tree) ──
// Drag state for today panel
let _todayDragIdx = null;

function renderTodayPanel() {
  const list = document.getElementById('todayPanelList');
  const countBadge = document.getElementById('todayPanelCount');
  if (!list) return;
  const todayStr = localDateStr();
  // 有效今日：重置時間決定，00:00~重置時間之間仍屬上個週期
  const effectiveTodayStr = localDateStr(new Date(getLastResetTimestamp()));
  // ★ 首頁（生命樹）今日任務面板：完成後即從清單消失，只保留未完成任務（任務頁不受影響）
  // 先算出「今天原本有標記、但已完成」的數量，供 badge／空狀態文案判斷用
  const doneTodayCount = state.tasks.filter(t => t.scheduledFor === todayStr && t.status !== 'cancelled' && t.done).length;
  const todayTasks = state.tasks.filter(t => t.scheduledFor === todayStr && t.status !== 'cancelled' && !t.done);
  const overdueTasks = state.tasks.filter(t =>
    t.scheduledFor && t.scheduledFor < todayStr && !t.done && t.status !== 'cancelled'
  );
  let allToday = [...todayTasks, ...overdueTasks.filter(t => !todayTasks.find(x => x.id === t.id))];

  // ★ 套用頂部精力切換器篩選，讓「全/⚡/🍃/𖦏」在生命樹頁的今日任務面板也真的有效果
  // ★ 例外：低精力（charge）時，有最小行動的專注任務改用保底版本露出，不整個隱藏
  if (state.energyFilter && state.energyFilter !== 'all') {
    allToday = allToday.filter(t => _matchesEnergyFilter(t, state.energyFilter));
  }

  // Apply saved order: undone first (by saved order), done sinks to bottom
  if (!state.todayOrder) state.todayOrder = [];
  const orderMap = {};
  state.todayOrder.forEach((id, i) => { orderMap[id] = i; });
  allToday.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1; // 已完成沉底
    const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999;
    const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999;
    return oa - ob;
  });

  // badge 只顯示未完成數量；未完成清空但今天曾標記過任務時顯示 ✓
  const undoneCount = allToday.filter(t => !t.done).length;
  if (countBadge) {
    const prevText = countBadge.textContent;
    const newText = undoneCount > 0 ? String(undoneCount) : ((allToday.length > 0 || doneTodayCount > 0) ? '✓' : '');
    countBadge.classList.remove('badge-urgent', 'badge-done');
    void countBadge.offsetWidth;
    if (undoneCount > 0) {
      countBadge.classList.add('badge-urgent');
    } else if (allToday.length > 0 || doneTodayCount > 0) {
      countBadge.classList.add('badge-done');
    }
    if (prevText !== newText) {
      countBadge.textContent = newText;
      countBadge.animate([
        { transform: 'scale(0.6)', opacity: 0.4 },
        { transform: 'scale(1.3)', opacity: 1 },
        { transform: 'scale(1)',   opacity: 1 }
      ], { duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
    } else {
      countBadge.textContent = newText;
    }
  }

  if (allToday.length === 0) {
    list.innerHTML = doneTodayCount > 0
      ? '<div class="today-panel-empty">🎉 今日任務都完成了！</div>'
      : '<div class="today-panel-empty">今天還沒有標記任何任務。在任務旁點側邊藍線來安排今日。</div>';
    return;
  }
  const goalIconMap = { 技能:'🚩', 自我:'💎', 日常:'🧭', 任意:'🌈' };
  list.innerHTML = allToday.map((t, idx) => {
    const gIcon = goalIconMap[t.goal] || '●';
    // ★ 低精力模式下，有最小行動的專注任務：顯示保底版本文字，並加上 🪫 標記，
    //   滑鼠移上去（或手機長按）仍看得到原本的任務全名，不會混淆。
    const isSoftened = state.energyFilter === 'charge' && t.recurring && !!t.minimalAction && t.energy !== 'charge';
    const chipDisplayName = isSoftened ? t.minimalAction : t.name;
    const chipNameTitle = isSoftened ? `原任務：${t.name}（低精力保底版本）` : (t.done ? '已完成 — 雙擊跳轉任務' : '雙擊跳轉到此任務（可拖曳排序）');
    const isOverdue = t.scheduledFor < effectiveTodayStr && !isPreScheduled(t) && !t.done;
    const isPreSched = isPreScheduled(t) && !t.done;
    const overdueStyle = isOverdue ? 'border-color:rgba(192,86,90,0.3);background:rgba(192,86,90,0.04);' : '';
    const stripeColor = isOverdue ? 'var(--rose)' : isPreSched ? 'rgba(160,170,185,0.75)' : '#C9A227';
    const stripeTitle = isOverdue ? '逾期 — 點擊取消標記' : isPreSched ? '預排於重置後執行 — 點擊取消' : '今日處理中 — 點擊取消標記';
    return `<div class="today-task-chip${t.done ? ' done-chip' : ''}"
      style="${overdueStyle}cursor:${t.done ? 'default' : 'grab'};position:relative;padding-left:18px;overflow:hidden"
      data-idx="${idx}" data-id="${t.id}"
      draggable="${!t.done}"
      ondblclick="navigateToTask(${t.id})"
      ondragstart="${!t.done ? `todayChipDragStart(event,${idx})` : ''}"
      ondragover="${!t.done ? `todayChipDragOver(event,${idx})` : ''}"
      ondrop="${!t.done ? `todayChipDrop(event,${idx})` : ''}"
      ondragend="${!t.done ? 'todayChipDragEnd(event)' : ''}"
      title="${chipNameTitle}">
      ${!t.done ? `<div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${stripeColor};border-radius:3px 0 0 3px;opacity:0.85;cursor:pointer;transition:width 0.15s,opacity 0.15s;flex-shrink:0" title="${stripeTitle}" onclick="event.stopPropagation();setTaskStatus(${t.id},'none')" ></div>` : ''}
      <span class="today-chip-drag-handle" onclick="event.stopPropagation()" title="拖曳排序" style="${t.done ? 'visibility:hidden' : ''}">⠿</span>
      <div class="today-chip-check${t.done ? ' checked' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})">${t.done ? '✓' : ''}</div>
      <span class="today-chip-goal">${gIcon}</span>
      ${isSoftened ? '<span title="低精力保底版本" style="flex-shrink:0">🪫</span>' : ''}
      <span class="today-chip-name" style="${isSoftened ? 'color:var(--sky);font-style:italic' : isOverdue ? 'color:var(--rose)' : isPreSched ? 'color:var(--text-dim)' : ''}">${escHtml(chipDisplayName)}</span>
      ${t.taskDate && !t.done && !isOverdue ? (() => {
        const diff = Math.round((new Date(t.taskDate) - new Date(todayStr)) / 86400000);
        if (diff < 0 || diff > 7) return '';
        const lbl = diff === 0 ? '今天截止' : `剩 ${diff} 天`;
        const col = diff === 0 ? 'var(--rose)' : diff <= 2 ? '#C9A227' : 'var(--sky)';
        return `<span style="font-size:9px;color:${col};flex-shrink:0;font-weight:600;border:1px solid ${col};border-radius:8px;padding:0 4px">${lbl}</span>`;
      })() : ''}
      ${isOverdue ? '<span style="font-size:10px;color:var(--rose);flex-shrink:0;font-weight:600">逾期</span>' : ''}
      ${isPreSched ? '<span style="font-size:10px;color:var(--text-faint);flex-shrink:0">預排</span>' : ''}
      ${!t.done ? `<span class="btn-del-icon" style="font-size:12px;flex-shrink:0;padding:1px 5px;border-radius:4px" onclick="event.stopPropagation();deleteTodayTask(${t.id})" title="刪除此任務">🗑</span>` : ''}
    </div>`;
  }).join('');

  // 手機：今日任務觸控拖曳排序
  if (window.matchMedia('(pointer: coarse)').matches) _wireTodayChipTouchDrag(list);

  // 手機雙擊模擬（touchend 間隔 < 350ms 視為雙擊）
  list.querySelectorAll('.today-task-chip[data-id]').forEach(chip => {
    let lastTap = 0;
    chip.addEventListener('touchend', e => {
      // 忽略從 checkbox / delete / stripe 等子元素冒泡上來的 touch
      if (e.target.closest('.today-chip-check, .btn-del-icon, [onclick*="setTaskStatus"]')) return;
      const now = Date.now();
      if (now - lastTap < 350) {
        e.preventDefault();
        navigateToTask(Number(chip.dataset.id));
      }
      lastTap = now;
    }, { passive: false });
  });
}

// ── Delete task from today panel ──
function deleteTodayTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.tasks = state.tasks.filter(x => x.id !== id);
  renderTodayPanel();
  renderTasks();
  renderTree();
  renderStats();
  _syncNow();
  showToast('🗑 任務已刪除');
}

// Today panel drag handlers
function todayChipDragStart(e, idx) {
  _todayDragIdx = idx;
  const chip = e.currentTarget;
  chip.classList.add('dragging-chip');
  e.dataTransfer.effectAllowed = 'move';
}

function todayChipDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.today-task-chip').forEach((el, i) => {
    el.classList.toggle('drag-over-chip', i === idx && i !== _todayDragIdx);
  });
}

function todayChipDrop(e, toIdx) {
  e.preventDefault();
  if (_todayDragIdx === null || _todayDragIdx === toIdx) return;
  // ── Bug 4 fix：與 renderTodayPanel 邏輯完全對齊，確保拖曳後排序正確 ──
  const todayStr = localDateStr();
  const todayTasks = state.tasks.filter(t => t.scheduledFor === todayStr && t.status !== 'cancelled' && !t.done);
  const overdueTasks = state.tasks.filter(t => t.scheduledFor && t.scheduledFor < todayStr && !t.done && t.status !== 'cancelled');
  let allToday = [...todayTasks, ...overdueTasks.filter(t => !todayTasks.find(x => x.id === t.id))];
  // ★ 跟 renderTodayPanel 的篩選邏輯保持一致，否則篩選中拖曳排序的索引會跟畫面顯示的不對應
  if (state.energyFilter && state.energyFilter !== 'all') {
    allToday = allToday.filter(t => t.energy === state.energyFilter);
  }

  if (!state.todayOrder) state.todayOrder = [];
  const orderMap = {};
  state.todayOrder.forEach((id, i) => { orderMap[id] = i; });
  allToday.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999;
    const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999;
    return oa - ob;
  });

  // Reorder
  const moved = allToday.splice(_todayDragIdx, 1)[0];
  allToday.splice(toIdx, 0, moved);
  const validIds = new Set(state.tasks.map(t => t.id));
  state.todayOrder = allToday.map(t => t.id).filter(id => validIds.has(id));

  document.querySelectorAll('.today-task-chip').forEach(el => el.classList.remove('drag-over-chip', 'dragging-chip'));
  _todayDragIdx = null;
  renderTodayPanel();
  syncToCloud();
}

function todayChipDragEnd(e) {
  document.querySelectorAll('.today-task-chip').forEach(el => el.classList.remove('drag-over-chip', 'dragging-chip'));
  _todayDragIdx = null;
}

// ── Today Panel 觸控拖曳（手機）──
function _wireTodayChipTouchDrag(list) {
  if (!list) return;
  let _tidx = null, _clone = null, _startY = 0;

  list.querySelectorAll('.today-chip-drag-handle').forEach(handle => {
    handle.addEventListener('touchstart', e => {
      const chip = handle.closest('.today-task-chip');
      if (!chip) return;
      _tidx = parseInt(chip.dataset.idx);
      _startY = e.touches[0].clientY;
      const rect = chip.getBoundingClientRect();
      _clone = chip.cloneNode(true);
      _clone.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.85;width:' + rect.width + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;border-radius:8px;box-shadow:0 6px 24px rgba(201,162,39,0.25);transition:none';
      document.body.appendChild(_clone);
      chip.classList.add('dragging-chip');
      e.preventDefault();
    }, { passive: false });
  });

  list.addEventListener('touchmove', e => {
    if (_tidx === null || !_clone) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - _startY;
    _clone.style.transform = 'translateY(' + dy + 'px)';
    list.querySelectorAll('.today-task-chip').forEach(el => el.classList.remove('drag-over-chip'));
    const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const targetChip = target && target.closest('.today-task-chip');
    if (targetChip && parseInt(targetChip.dataset.idx) !== _tidx) {
      targetChip.classList.add('drag-over-chip');
    }
  }, { passive: false });

  list.addEventListener('touchend', e => {
    if (_tidx === null) return;
    if (_clone) { _clone.remove(); _clone = null; }
    list.querySelectorAll('.today-task-chip').forEach(el => el.classList.remove('dragging-chip', 'drag-over-chip'));
    const pt = e.changedTouches[0];
    const target = document.elementFromPoint(pt.clientX, pt.clientY);
    const targetChip = target && target.closest('.today-task-chip');
    if (targetChip) {
      todayChipDrop({ preventDefault: () => {} }, parseInt(targetChip.dataset.idx));
    }
    _tidx = null;
  });
}

// ── Navigate to task in task overview with highlight effect ──
function navigateToTask(id) {
  const t = state.tasks.find(x => x.id === id);

  // ★ 桌面版：不跳轉到任務頁（該頁桌面已隱藏導覽入口），改成留在生命樹頁，
  //   直接把右欄切到這個任務所屬的分類，並對該任務卡片加搖動動畫強調。
  if (_isDesktopTaskLayout() && t) {
    state.goalFilter = t.goal;
    renderTree(); // 連動更新右欄（見 renderTree 結尾）
    setTimeout(() => {
      const el = document.getElementById('task-' + id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('task-shake');
      setTimeout(() => el.classList.remove('task-shake'), 600);
    }, 80);
    return;
  }

  // ── 手機版：維持原本行為，跳轉到任務頁並用脈動效果強調 ──
  // Clear goal filter and switch to tasks page
  state.goalFilter = null;
  state.energyFilter = 'all';
  state.taskTypeFilter = 'all';
  state.timeFilter = 'all';
  const label = document.getElementById('filtered-label');
  if (label) label.textContent = '';
  const clearBtn = document.getElementById('clear-filter-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  updateFilterChips('all');
  showPage('tasks', true);
  renderTasks();
  // Scroll to and highlight the task card
  setTimeout(() => {
    const el = document.getElementById('task-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('task-highlight');
    setTimeout(() => el.classList.remove('task-highlight'), 1600);
  }, 80);
}


function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const wasDone = t.done;
  t.done = !t.done;
  // 安卓觸覺回饋：完成任務輕震動，取消則短震
  if (navigator.vibrate) navigator.vibrate(wasDone ? 15 : [20, 30, 20]);
  if (!wasDone) {
    // 使用「有效今日」：若現在在 00:00~重置時間 之間，仍屬上個週期的今天
    t.completedAt = localDateStr(new Date(getLastResetTimestamp()));
    // ★ 記錄真實完成時間戳，讓 runDailyReset() 能判斷這筆完成是否屬於「本週期」，
    // 避免重複任務在剛完成、重置又意外重跑一次時被誤判成「舊週期未完成」而打回未完成
    t.completedTs = Date.now();
    // ── 追蹤完成次數與近期完成日期（用於早晨重複任務排序與連續天數判斷）──
    if (!t.completionCount) t.completionCount = 0;
    t.completionCount++;
    if (!t.recentCompletions) t.recentCompletions = [];
    // 加入今日日期，保留最近 14 筆，去重
    if (!t.recentCompletions.includes(t.completedAt)) {
      t.recentCompletions.push(t.completedAt);
    }
    // 只保留最近 14 天
    t.recentCompletions = t.recentCompletions.sort().slice(-14);

    state.done = state.tasks.filter(x => x.done).length;
    showCelebration(t);
    checkRewardUnlocks();
    const _todayStr = localDateStr();
    const _todayAll = state.tasks.filter(x => x.scheduledFor === _todayStr && x.status !== 'cancelled');
    const _todayUndone = _todayAll.filter(x => !x.done);
    if (_todayAll.length > 0 && _todayUndone.length === 0) {
      setTimeout(() => showAllClearCelebration(_todayAll.length), 800);
    }
    // If interval-recurring, schedule next occurrence BEFORE onTaskCompleted
    // so the 🌟 碎片 toast from onTaskCompleted is the last one shown (not overwritten by 🔁 toast)
    // ★ 但如果這個任務綁了「截止日」、而且今天已經超過截止日（遲到才補做），
    // 就不再建立下一次——這個重複系列在截止日就該結束，不應該因為遲交一次
    // 而又生出一個新的未來任務。
    const _pastDeadline = t.taskDate && localDateStr() > t.taskDate;
    if (t.recurring && t.recurMode === 'interval' && !_pastDeadline) {
      const cloneId = scheduleIntervalTask(t);
      // Mark with clone id so undo can remove the future clone
      t._intervalCompleted = true;
      t._intervalCloneId = cloneId;
    }
    onTaskCompleted(t);
    if (t.reward) { setTimeout(() => showInstantRewardPopup(t.reward), 2900); }
    // Recalculate done count (interval task stays in array as done)
    state.done = state.tasks.filter(x => x.done).length;
    // ── Bug 2 fix：完成當下立即寫 doneHistory，不等每日重置，防止 snapshot 覆蓋後紀錄消失 ──
    if (!state.doneHistory) state.doneHistory = [];
    const _histKey = t.id + '_' + t.completedAt;
    if (!state.doneHistory.some(h => h.id === _histKey)) {
      state.doneHistory.push({ id: _histKey, taskId: t.id, name: t.name, goal: t.goal, energy: t.energy, completedAt: t.completedAt, recurring: t.recurring || false });
    }
  } else {
    // 取消完成：清除 completedAt 並從 doneHistory 移除對應紀錄
    const wasCompletedAt = t.completedAt;
    t.completedAt = null;
    t.completedTs = null;
    // ── 撤銷 doneHistory：移除剛才寫入的那筆，避免成長軌跡留下錯誤紀錄 ──
    if (wasCompletedAt && state.doneHistory) {
      const histKey = t.id + '_' + wasCompletedAt;
      state.doneHistory = state.doneHistory.filter(h => h.id !== histKey);
    }
    // ── 間隔重複任務撤銷：刪除已排好的下次 clone，還原本任務為未完成 ──
    if (t._intervalCompleted && t._intervalCloneId) {
      state.tasks = state.tasks.filter(x => x.id !== t._intervalCloneId);
    }
    t._intervalCompleted = false;
    t._intervalCloneId = null;
    state.done = state.tasks.filter(x => x.done).length;
    state.doneOpen = true;
    onTaskUncompleted(t);
  }
  renderTasks();
  renderStats();
  renderTree();
  renderTodayPanel();
  saveStateLocal(); // 確保 wishPoints 等狀態在 cloud sync 前已寫入本地
  // ── Bug fix：先標記忽略視窗，再推送，避免 snapshot 在 _fbSave() await 期間用舊資料覆蓋 ──
  if (_syncDebounceTimer !== null) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  _markSyncWrite(); // 立即抑制 snapshot，不等 _fbSave() 完成
  _doSyncToCloud();
}

function showCelebration(task) {
  // ── 卡片發光：找到對應分類的 goal-ring-card 觸發 pulse ──
  if (task && task.goal) {
    const grid = document.getElementById('treeGrid');
    if (grid) {
      const node = treeNodes.find(n => n.key === task.goal);
      const card = grid.querySelector(`[data-goal-key="${task.goal}"]`);
      if (card && node) {
        // 判斷這次完成後分類是否恰好達到今日目標（滿格）
        const todayStr = localDateStr(new Date(getLastResetTimestamp()));
        const doneCnt = state.tasks.filter(t => t.done && t.goal === node.key && t.completedAt === todayStr).length;
        const goal = Math.max(1, node.dailyGoal || 1);
        const isJustFull = doneCnt >= goal;

        card.style.setProperty('--pulse-color', node.ringColor);
        if (isJustFull) {
          card.classList.add('goal-ring-full');
          setTimeout(() => card.classList.remove('goal-ring-full'), 1400);
          _showGoalFullBurst(card, node);
        } else {
          card.classList.add('goal-ring-pulse');
          setTimeout(() => card.classList.remove('goal-ring-pulse'), 900);
        }
      }
    }
  }

  // ── 格言：只在 20% 機率顯示，避免疲乏 ──
  const shouldShow = Math.random() < 0.2;
  if (!shouldShow) return;

  const cel = document.getElementById('celebration');
  const sub = document.getElementById('celebSub');
  if (task && task.meaning && task.meaning.trim()) {
    sub.textContent = task.meaning.trim();
  } else {
    const quotes = state.customQuotes && state.customQuotes.length > 0 ? state.customQuotes : [];
    if (!quotes.length) return;
    sub.textContent = quotes[Math.floor(Math.random() * quotes.length)];
  }
  cel.classList.add('show');
  setTimeout(() => cel.classList.remove('show'), 2800);
}

// ── 分類滿格爆發特效 ──
function _showGoalFullBurst(card, node) {
  const rect = card.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // 文字標籤
  const label = document.createElement('div');
  label.textContent = `${node.icon} ${node.label} 完成！`;
  label.style.cssText = `
    position:fixed;
    left:${cx}px; top:${cy - 20}px;
    transform:translate(-50%, -50%);
    color:${node.ringColor};
    font-size:16px; font-weight:800;
    white-space:nowrap; pointer-events:none;
    z-index:99999;
    text-shadow: 0 0 20px ${node.ringColor}88, 0 2px 8px rgba(0,0,0,0.12);
    animation: goalFullLabel 1.6s cubic-bezier(0.22,1,0.36,1) forwards;
  `;
  document.body.appendChild(label);
  setTimeout(() => label.remove(), 1700);

  // 粒子爆發
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    const angle = (i / 22) * 360;
    const dist = 55 + Math.random() * 50;
    const size = 5 + Math.random() * 6;
    const dx = Math.cos(angle * Math.PI / 180) * dist;
    const dy = Math.sin(angle * Math.PI / 180) * dist;
    const delay = Math.random() * 0.12;
    p.style.cssText = `
      position:fixed;
      left:${cx}px; top:${cy}px;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:${node.ringColor};
      pointer-events:none; z-index:99998;
      opacity:1;
      animation: goalParticle${i} 0.9s ease ${delay}s forwards;
    `;
    // 用 inline keyframe via Web Animations API
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`, opacity: 0 }
    ], { duration: 900, delay: delay * 1000, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

// ── Postpone ──
// ── Quick Note (備忘便籤) ──
let _noteTargetId = null;

function openNoteModal(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  _noteTargetId = id;
  document.getElementById('noteModalTaskName').textContent = t.name;
  const existingEl = document.getElementById('noteModalExisting');
  const clearBtn = document.getElementById('noteClearBtn');
  if (t.note) {
    existingEl.style.display = 'block';
    existingEl.innerHTML = `<div style="font-size:12px;color:var(--text-faint);margin-bottom:4px;letter-spacing:0.06em;text-transform:uppercase">目前備忘</div><div style="font-size:13px;color:var(--gold);padding:8px 10px;background:rgba(200,169,110,0.08);border-radius:6px;border-left:2px solid var(--gold);line-height:1.6">${escHtml(t.note)}</div>`;
    clearBtn.style.display = 'inline-flex';
  } else {
    existingEl.style.display = 'none';
    clearBtn.style.display = 'none';
  }
  const input = document.getElementById('noteInput');
  input.value = t.note || '';
  document.getElementById('noteModal').classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function saveNote() {
  const t = state.tasks.find(x => x.id === _noteTargetId);
  if (!t) return;
  const val = document.getElementById('noteInput').value.trim();
  t.note = val || null;
  closeNoteModal();
  renderTasks();
  if (typeof _renderTreeRightPanel === 'function') _renderTreeRightPanel();
  syncToCloud();
  showToast(val ? '📝 備忘已儲存' : '備忘已清除');
}

function clearNote() {
  const t = state.tasks.find(x => x.id === _noteTargetId);
  if (t) t.note = null;
  closeNoteModal();
  renderTasks();
  if (typeof _renderTreeRightPanel === 'function') _renderTreeRightPanel();
  syncToCloud();
  showToast('備忘已清除');
}

function closeNoteModal() {
  document.getElementById('noteModal').classList.remove('open');
  _noteTargetId = null;
}

// ── Recurring UI helpers ──
function toggleRecurringOptions(prefix) {} // legacy no-op
function toggleIntervalInput(prefix) {} // legacy no-op

// 新版重複 toggle：第一次點亮 = 每天；第二次點 = 顯示天數輸入；第三次 = 關閉
const _recurState = {}; // 'off' | 'daily' | 'interval'
function toggleRecurSimple(prefix) {
  const cur = _recurState[prefix] || 'off';
  let next;
  if (cur === 'off') next = 'daily';
  else if (cur === 'daily') next = 'interval';
  else next = 'off';
  _recurState[prefix] = next;
  _applyRecurUI(prefix, next);
}
function _applyRecurUI(prefix, state) {
  const btn = document.getElementById(prefix + 'RecurToggle');
  const label = document.getElementById(prefix + 'RecurLabel');
  const wrap = document.getElementById(prefix + 'IntervalWrap');
  const hiddenRecur = document.getElementById(prefix + 'TaskRecurring');
  const hiddenMode = document.getElementById(prefix + 'RecurModeHidden');
  // 最小行動欄位：只在「重複任務」時顯示（不論能量等級），
  // 因為保底版本主要是為了讓重複任務不會因為沒力氣而被永遠跳過。
  const maWrap = document.getElementById(prefix + 'MinimalActionWrap');
  if (maWrap) maWrap.style.display = state === 'off' ? 'none' : 'block';
  if (state === 'off') {
    if (btn) { btn.style.borderColor = ''; btn.style.color = ''; }
    if (label) label.textContent = '不重複';
    if (wrap) wrap.style.display = 'none';
    if (hiddenRecur) hiddenRecur.value = 'false';
    if (hiddenMode) hiddenMode.value = 'daily';
  } else if (state === 'daily') {
    if (btn) { btn.style.borderColor = 'var(--green)'; btn.style.color = 'var(--green)'; }
    if (label) label.textContent = '每天';
    if (wrap) wrap.style.display = 'none';
    if (hiddenRecur) hiddenRecur.value = 'true';
    if (hiddenMode) hiddenMode.value = 'daily';
  } else {
    if (btn) { btn.style.borderColor = 'var(--green)'; btn.style.color = 'var(--green)'; }
    if (label) label.textContent = '間隔';
    if (wrap) wrap.style.display = 'flex';
    if (hiddenRecur) hiddenRecur.value = 'true';
    if (hiddenMode) hiddenMode.value = 'interval';
  }
}

// Schedule a future cloned task for interval-recurring tasks
function scheduleIntervalTask(t) {
  const days = t.recurInterval || 7;
  // 「有效今日」：若現在在 00:00~重置時間 之間，實際上還是上個週期的「今天」
  // 用重置時間點的日期作為基準，避免深夜完成時 +days 差一天
  const resetTs = getLastResetTimestamp();
  const effectiveToday = localDateStr(new Date(resetTs));
  const future = new Date(resetTs);
  future.setDate(future.getDate() + days);
  const futureStr = localDateStr(future);
  const clone = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: t.name, meaning: t.meaning || '', goal: t.goal, energy: t.energy,
    done: false, postponed: 0,
    recurring: true, recurMode: 'interval', recurInterval: days,
    scheduledFor: futureStr,
    _intervalScheduled: true
  };
  state.tasks.push(clone);
  if (futureStr === effectiveToday) {
    showToast(`🔁 「${t.name}」已加入今日任務`);
    renderTodayPanel();
  } else {
    showToast(`🔁 ${days} 天後「${t.name}」將自動出現在今日任務`);
  }
  return clone.id; // return clone id so caller can store it for undo
}

// ── Auto-schedule tasks by taskDate or interval scheduledFor ──
function checkTaskDates() {
  // 「有效今日」：00:00~重置時間 之間仍視為上個週期的今天
  const effectiveToday = localDateStr(new Date(getLastResetTimestamp()));
  let changed = false;
  state.tasks.forEach(t => {
    if (t.done) return;
    // Auto-mark by taskDate — 只在有效今日才排入，不在深夜提早觸發
    // ★ 重複任務不在這裡自動排入：有日期的重複任務改成把日期當「重複到此為止」
    // 的截止日，透過批次清單（_getRecurringTasksDueToday）每天詢問，而不是
    // 直接默默排入今日、永遠跳過批次清單。非重複任務行為不變。
    if (t.taskDate && t.taskDate <= effectiveToday && !t.scheduledFor && t.status !== 'cancelled' && !t.recurring) {
      t.scheduledFor = effectiveToday;
      t.status = 'active';
      t._scheduledByDate = true;
      changed = true;
    }
    // Interval-recurring clone: when scheduledFor date arrives, mark as today
    if (t._intervalScheduled && t.scheduledFor && t.scheduledFor <= effectiveToday && t.status !== 'cancelled') {
      changed = true;
    }
  });
  if (changed) {
    renderTodayPanel();
    renderTasks();
    renderTree(); // ★ 補上：自動排入今日後，分類卡片紅色未完成數量要跟著更新
    syncToCloud();
  }
}

// ── Add Task ──

function addTask() {
  const name = document.getElementById('newTaskName').value.trim();
  if (!name) return;
  const meaning = document.getElementById('newTaskMeaning').value.trim();
  const goal = document.getElementById('newTaskGoal').value || '技能';
  const energy = document.getElementById('newTaskEnergy').value || 'easy';
  const recurring = document.getElementById('newTaskRecurring').value === 'true';
  let recurMode = 'daily';
  let recurInterval = 0;
  if (recurring) {
    const modeHidden = document.getElementById('newRecurModeHidden');
    recurMode = modeHidden ? modeHidden.value : 'daily';
    if (recurMode === 'interval') {
      recurInterval = parseInt(document.getElementById('newTaskInterval').value) || 1;
    }
  }
  const taskDate = document.getElementById('newTaskDate').value || null;
  const rewardInput = document.getElementById('newTaskReward');
  const reward = rewardInput ? rewardInput.value.trim() : '';
  const minimalActionInput = document.getElementById('newTaskMinimalAction');
  const minimalAction = minimalActionInput ? minimalActionInput.value.trim() : '';
  // Remove sandbox item if it was picked for reward
  if (reward && window._pendingSandboxRemove && window._pendingSandboxRemove['new'] !== undefined) {
    state.sandbox.splice(window._pendingSandboxRemove['new'], 1);
    delete window._pendingSandboxRemove['new'];
    renderSandbox();
  }
  // Remove sandbox item if task name was picked from sandbox
  if (window._pendingSandboxRemoveName && window._pendingSandboxRemoveName['new'] !== undefined) {
    const idx = window._pendingSandboxRemoveName['new'];
    // 用 name 反查，防止同時操作時 index 已過期
    const targetText = typeof state.sandbox[idx] === 'string' ? state.sandbox[idx] : (state.sandbox[idx] && state.sandbox[idx].text);
    const freshIdx = targetText !== undefined ? state.sandbox.findIndex(s => (typeof s === 'string' ? s : s.text) === targetText) : idx;
    if (freshIdx >= 0 && state.sandbox[freshIdx] !== undefined) {
      state.sandbox.splice(freshIdx, 1);
      renderSandbox();
    }
    delete window._pendingSandboxRemoveName['new'];
  }
  const todayStr = localDateStr();
  const newTask = { id: Date.now(), name, meaning, goal, energy, reward: reward || null, done: false, postponed: 0,
    recurring: recurring || false,
    recurMode: recurring ? recurMode : null,
    recurInterval: recurring && recurMode === 'interval' ? recurInterval : 0,
    taskDate: taskDate || null,
    minimalAction: (recurring && minimalAction) ? minimalAction : null
  };
  // If the task date is today, auto-mark as today's task
  // 注意：這裡刻意用 localDateStr()（時鐘日期）而非 effectiveToday，
  // 因為 00:00~重置時間 期間使用者可能在安排「隔天（重置後）」的任務，應保留此行為。
  if (taskDate && taskDate === todayStr) {
    newTask.scheduledFor = todayStr;
    newTask.status = 'active';
  }
  // If opened via "新增今日任務" button, always schedule for today
  if (state._addTaskForToday) {
    newTask.scheduledFor = todayStr;
    newTask.status = 'active';
    state._addTaskForToday = false;
  }
  state.tasks.push(newTask);
  document.getElementById('newTaskName').value = '';
  document.getElementById('newTaskMeaning').value = '';
  document.getElementById('newTaskDate').value = '';
  if (minimalActionInput) minimalActionInput.value = '';
  _recurState['new'] = 'off';
  _applyRecurUI('new', 'off');
  const rewardField = document.getElementById('newTaskReward');
  if (rewardField) rewardField.value = '';
  // ★ Fix：新增後保留上次選的分類，方便連續新增同類任務（不重置回預設「技能」）
  // _setGoalBtn('技能');  ← 移除，保持現有選擇
  _setEnergyBtn('easy');
  // 不關閉 modal，清空後重新 focus，讓使用者可以連續新增（按取消或 Esc 離開）
  setTimeout(() => {
    const inp = document.getElementById('newTaskName');
    if (inp) inp.focus();
  }, 30);
  // If added from the tree today panel, stay on tree page
  if (newTask.scheduledFor === todayStr && document.getElementById('page-tree').classList.contains('active')) {
    renderTree();
    renderTodayPanel();
  } else {
    renderTasks();
    renderTree();
  }
  showToast('🌱 任務已種下，再新增或按取消關閉');
  _syncNow();
}

// ── Quick Todo（生命樹下方的輕量待辦清單）──
// 直接借用既有的 task 物件與 toggleTask() 流程，
// 這樣完成時會「自動」跟一般任務一樣寫入 doneHistory、給願望碎片、
// 並且在每日重置時比照非重複任務被歸檔清除，不需要另外寫一套規則。
// isQuickTodo 只用來讓這個頁面篩出屬於自己的項目，不影響任務總覽/生命樹的篩選。
function renderTodoPage() {
  const list = document.getElementById('todoList');
  const doneList = document.getElementById('todoDoneList');
  if (!list || !doneList) return;
  const items = state.tasks.filter(t => t.isQuickTodo);
  const pending = items.slice().sort((a, b) => b.id - a.id).filter(t => !t.done);
  const done = items.filter(t => t.done);

  list.innerHTML = pending.length ? pending.map(t => `
    <div class="task-item" onclick="toggleTask(${t.id})">
      <div class="task-check" onclick="event.stopPropagation();toggleTask(${t.id})"></div>
      <div class="task-body"><div class="task-name">${escHtml(t.name)}</div></div>
      <span class="sandbox-del" onclick="event.stopPropagation();deleteQuickTodo(${t.id})" title="刪除">×</span>
    </div>
  `).join('') : '<div style="color:var(--text-faint);font-size:13px;font-style:italic;padding:8px">還沒有待辦事項，寫下第一件事吧。</div>';

  doneList.innerHTML = done.length ? done.map(t => `
    <div class="task-item done" onclick="toggleTask(${t.id})">
      <div class="task-check checked" onclick="event.stopPropagation();toggleTask(${t.id})">✓</div>
      <div class="task-body"><div class="task-name">${escHtml(t.name)}</div></div>
      <span class="sandbox-del" onclick="event.stopPropagation();deleteQuickTodo(${t.id})" title="刪除">×</span>
    </div>
  `).join('') : '<div style="color:var(--text-faint);font-size:12px;padding:4px 8px">今天還沒有完成的項目</div>';
}

function quickAddTodo() {
  const input = document.getElementById('todoInput');
  const name = input.value.trim();
  if (!name) return;
  const newTask = {
    id: Date.now(), name, meaning: '', goal: '日常', energy: 'easy',
    reward: null, done: false, postponed: 0,
    recurring: false, recurMode: null, recurInterval: 0, taskDate: null,
    minimalAction: null, isQuickTodo: true
  };
  state.tasks.push(newTask);
  input.value = '';
  input.focus();
  saveStateLocal();
  renderTodoPage();
  _syncNow();
}

function deleteQuickTodo(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  // 若已完成，一併撤銷對應的成長軌跡紀錄，避免留下刪除後仍存在的紀錄
  if (t.done && t.completedAt && state.doneHistory) {
    const histKey = t.id + '_' + t.completedAt;
    state.doneHistory = state.doneHistory.filter(h => h.id !== histKey);
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  saveStateLocal();
  renderTodoPage();
  _syncNow();
}

// ── Sandbox ──
function renderSandbox() {
  const list = document.getElementById('sandboxList');
  if (state.sandbox.length === 0) {
    list.innerHTML = '<div style="color:var(--text-faint);font-size:13px;font-style:italic;padding:8px">還沒有任何探索。把你的好奇心丟進來吧。</div>';
    return;
  }
  list.innerHTML = state.sandbox.map((s, i) => `
    <div class="sandbox-item">
      <span class="sandbox-text">${escHtml(typeof s === 'string' ? s : (s.text || ''))}</span>
      <span class="sandbox-del" onclick="removeSandbox(${i})">×</span>
    </div>
  `).join('');
}

function addSandbox() {
  const input = document.getElementById('sandboxInput');
  const val = input.value.trim();
  if (!val) return;
  state.sandbox.push(val);
  input.value = '';
  renderSandbox();
  _syncNow();
}

function removeSandbox(i) {
  state.sandbox.splice(i, 1);
  renderSandbox();
  saveStateLocal();
  _syncNow();
}

// ══════════════════════════════════════════════════════
// ── 全清慶祝 Banner
// ══════════════════════════════════════════════════════
function showAllClearCelebration(count) {
  const banner = document.getElementById('allClearBanner');
  const sub    = document.getElementById('allClearSub');
  if (!banner) return;
  if (sub) sub.textContent = `完成了 ${count} 件任務，今天你很棒 ✦`;
  banner.classList.remove('show', 'hide');
  void banner.offsetWidth;
  banner.classList.add('show');
  _showAllClearParticles();
  setTimeout(() => {
    banner.classList.remove('show');
    banner.classList.add('hide');
    setTimeout(() => banner.classList.remove('hide'), 450);
  }, 4500);
}
window.showAllClearCelebration = showAllClearCelebration;

function _showAllClearParticles() {
  const cx = window.innerWidth / 2;
  const cy = 80;
  const colors = ['#4CAF50','#81C784','#A5D6A7','#C9A227','#FFD54F','#fff'];
  for (let i = 0; i < 28; i++) {
    const p     = document.createElement('div');
    const angle = (i / 28) * 360 + Math.random() * 10;
    const dist  = 60 + Math.random() * 80;
    const size  = 4 + Math.random() * 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dx    = Math.cos(angle * Math.PI / 180) * dist;
    const dy    = Math.sin(angle * Math.PI / 180) * dist + 30;
    p.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};pointer-events:none;z-index:99997;`;
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(0.2)`, opacity: 0 }
    ], { duration: 900 + Math.random() * 400, delay: Math.random() * 150, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
}

// ══════════════════════════════════════════════════════
// ── 重置倒數計時條
// ══════════════════════════════════════════════════════
let _countdownTimer = null;

function updateResetCountdown() {
  const bar   = document.getElementById('resetCountdownBar');
  const label = document.getElementById('resetCountdownLabel');
  const fill  = document.getElementById('resetCountdownFill');
  const time  = document.getElementById('resetCountdownTime');
  if (!bar || !label || !fill || !time) return;

  const msLeft  = getNextResetMs();
  const totalMs = 24 * 60 * 60 * 1000;
  const pct     = Math.max(0, Math.min(100, (msLeft / totalMs) * 100));

  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const isWarning  = h < 2 && !(h < 1 && m < 30);
  const isUrgent   = h < 1 && m < 30;
  const isCritical = h === 0 && m < 10;

  bar.classList.toggle('warning', isWarning);
  bar.classList.toggle('urgent',  isUrgent);

  if (isCritical) {
    label.textContent = '⚠';
    time.textContent  = `${m}m ${s.toString().padStart(2,'0')}s`;
  } else if (isUrgent) {
    label.textContent = '⚠';
    time.textContent  = `${m}m`;
  } else if (isWarning) {
    label.textContent = '⏰';
    time.textContent  = `${h}h ${m.toString().padStart(2,'0')}m`;
  } else {
    label.textContent = '⏐';
    time.textContent  = `${h}h ${m.toString().padStart(2,'0')}m`;
  }

  fill.style.transition = 'none';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.width = pct + '%';
  }));
}

function startResetCountdown() {
  updateResetCountdown();
  if (_countdownTimer) clearTimeout(_countdownTimer);
  function _tick() {
    updateResetCountdown();
    const ms = getNextResetMs();
    _countdownTimer = setTimeout(_tick, ms < 10 * 60 * 1000 ? 1000 : 60000);
  }
  const ms = getNextResetMs();
  _countdownTimer = setTimeout(_tick, ms < 10 * 60 * 1000 ? 1000 : 60000);
}
window.startResetCountdown = startResetCountdown;
