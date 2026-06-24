// ── Lottery (抽獎區) ──


let lotteryState = {
  tickets: 0,
  cards: [],       // 9 cards, each { revealed, content, isWish, isRandomMission }
  todayDate: '',
  todayDone: 0,    // cumulative tasks completed today (resets at midnight)
  todayFlipped: 0, // how many cards flipped today (each flip costs 3 todayDone)
  randomMission: null, // assigned only when gold card is flipped; { taskIds, taskNames, requiredCount, completedTaskIds, awarded, assignedAt }
  tenPullTickets: 0, // 十連抽券：完成「限時活動」任務獲得，跨日不重置、不受每日重置邏輯影響
};

function getTodayKey() {
  // 使用「有效今日」：00:00~重置時間 之間仍屬上個週期的今天
  return localDateStr(new Date(getLastResetTimestamp()));
}

function generateRandomMission() {
  // Pick 1–3 random undone tasks as mission targets — called only when gold card is flipped
  // Exclude: done/completed tasks, future-only taskDate tasks, cancelled, future interval clones
  const todayStr = localDateStr();
  const undone = state.tasks.filter(t =>
    !t.done &&
    !t.taskDate &&                                          // 無固定日期（未來才到）
    !_isFutureIntervalTask(t, todayStr)                     // 排除未來才出現的 interval clone
  );
  if (undone.length === 0) return null;
  const shuffled = [...undone].sort(() => Math.random() - 0.5);
  const count = Math.min(Math.floor(Math.random() * 3) + 1, shuffled.length); // 1–3
  const picked = shuffled.slice(0, count);
  return {
    taskIds: picked.map(t => t.id),
    taskNames: picked.map(t => t.name),
    requiredCount: count,
    assignedAt: getTodayKey(),
    completedTaskIds: [],
    awarded: false,
  };
}

function initLottery() {
  const saved = localStorage.getItem('aethelgard_lottery');
  if (saved) {
    try { lotteryState = { ...lotteryState, ...JSON.parse(saved) }; } catch(e) {}
  }
  const today = getTodayKey();
  if (lotteryState.todayDate !== today) {
    lotteryState.todayDate = today;
    lotteryState.todayDone = 0;
    lotteryState.todayFlipped = 0;
    lotteryState.rmSlot = null;
    // Do NOT clear randomMission here — it persists until awarded or a new draw is made
  }
  // Migrate old saves that don't have todayFlipped
  if (lotteryState.todayFlipped === undefined) lotteryState.todayFlipped = 0;
  renderLottery();
}

function saveLottery() {
  localStorage.setItem('aethelgard_lottery', JSON.stringify(lotteryState));
}



function checkRandomMissionProgress() {
  const rm = lotteryState.randomMission;
  // Only track progress if mission was actually assigned (gold card flipped) and not yet awarded
  if (!rm || !rm.assignedAt || rm.awarded) return;
  // Check which mission tasks are now done
  const completedNow = rm.taskIds.filter(id => {
    const t = state.tasks.find(x => x.id === id);
    return t && t.done;
  });
  rm.completedTaskIds = completedNow;
  // If all completed and not yet awarded
  if (completedNow.length >= rm.requiredCount && !rm.awarded) {
    rm.awarded = true;
    const ticketsEarned = rm.requiredCount;
    lotteryState.tickets += ticketsEarned;
    saveLottery();
    syncToCloud();
    setTimeout(() => showToast(`🏆 隨機任務完成！獲得 ${ticketsEarned} 張抽獎券！`), 800);
    renderLottery();
  }
  saveLottery();
}

function _showRewardBadge(goalKey, text, color) {
  const grid = document.getElementById('treeGrid');
  const anchor = grid ? grid.querySelector(`[data-goal-key="${goalKey}"]`) : null;

  // 卡片不存在或不在可視範圍內（例如在任務頁），改用 toast
  if (!anchor) { showToast(text); return; }
  const rect = anchor.getBoundingClientRect();
  const inView = rect.width > 0 && rect.height > 0 &&
    rect.top < window.innerHeight && rect.bottom > 0 &&
    rect.left < window.innerWidth && rect.right > 0;
  if (!inView) { showToast(text); return; }

  const badge = document.createElement('div');
  badge.textContent = text;
  badge.style.cssText = `
    position:fixed;
    left:${rect.left + rect.width / 2}px;
    top:${rect.top}px;
    transform:translate(-50%, -8px);
    background:${color || '#C9A227'};
    color:#fff;
    font-size:13px;font-weight:700;
    padding:5px 12px;border-radius:20px;
    white-space:nowrap;pointer-events:none;
    z-index:99998;
    box-shadow:0 2px 12px rgba(0,0,0,0.18);
    animation:rewardBadgeFly 1.4s cubic-bezier(0.22,1,0.36,1) forwards;
  `;
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 1500);
}

function onTaskCompleted(task) {
  const today = getTodayKey();
  if (lotteryState.todayDate !== today) {
    lotteryState.todayDate = today;
    lotteryState.todayDone = 0;
    lotteryState.todayFlipped = 0;
  }
  const energy = task ? task.energy : null;
  const goal   = task ? task.goal   : null;
  const isCharge  = energy === 'charge';
  const isDaily   = goal === '日常';
  const isFocus   = energy === 'focus';

  if (!isCharge) {
    if (!isDaily) {
      lotteryState.todayDone++;
      // ★ 限時活動（技能）任務完成，額外贈送一張十連抽券
      if (goal === '技能') {
        lotteryState.tenPullTickets = (lotteryState.tenPullTickets || 0) + 1;
        _showRewardBadge(goal, '🎉 +1 十連抽券！', '#D4608A');
      } else {
        const hasWishes = (state.rewards || []).some(r => !r.claimed && (r.allocatedPoints||0) >= r.count && r.count > 0);
        const available = lotteryState.todayDone - (lotteryState.todayFlipped || 0);
        const badgeText = (available > 0 && hasWishes) ? '🎫 翻牌機會！去抽獎區' : '🎫 翻牌機會！';
        const node = typeof treeNodes !== 'undefined' && treeNodes.find(n => n.key === goal);
        _showRewardBadge(goal, badgeText, node ? node.ringColor : '#5B8DB8');
      }
      if (isFocus && Math.random() < 0.2) {
        lotteryState.todayDone++;
        _showFocusBonus();
      }
    } else {
      if (state.wishPoints === undefined) state.wishPoints = 0;
      state.wishPoints++;
      saveStateLocal();
      renderRewards();
      _showRewardBadge(goal, '🌟 +1 願望碎片', '#3A6EA5');
    }
  } else {
    // 充電任務：給一個輕量充電提示
    _showRewardBadge(goal, '⚡ 充電完成', '#7B9E87');
  }

  checkRandomMissionProgress();
  saveLottery();
  renderLottery();
}

function _showFocusBonus() {
  // 金黃色灑花特效
  const cel = document.createElement('div');
  cel.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  cel.innerHTML = '<div style="font-size:28px;animation:celebFade 2s ease forwards">🎊 專注加成！+1 券</div>';
  document.body.appendChild(cel);
  // Scatter gold particles
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    const x = Math.random() * 100, y = Math.random() * 100;
    const size = 6 + Math.random() * 8;
    p.style.cssText = `position:fixed;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:#C9A227;pointer-events:none;z-index:9999;animation:celebFade 1.8s ease ${Math.random()*0.4}s forwards;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2200);
  }
  setTimeout(() => cel.remove(), 2200);
}

function onTaskUncompleted(task) {
  const energy = task ? task.energy : null;
  const goal   = task ? task.goal   : null;
  const isCharge = energy === 'charge';
  const isDaily  = goal === '日常';

  if (!isCharge) {
    if (!isDaily) {
      // 核心任務：取消翻牌機會
      const minDone = (lotteryState.todayFlipped || 0);
      if (lotteryState.todayDone > minDone) lotteryState.todayDone--;
    } else {
      // 日常任務：取消碎片（日常任務才有給碎片）
      if (state.wishPoints === undefined) state.wishPoints = 0;
      state.wishPoints = Math.max(0, state.wishPoints - 1);
      saveStateLocal();
      renderRewards();
    }
  }
  checkRandomMissionProgress();
  saveLottery();
  renderLottery();
}

function buildCardPool() {
  // Gather unlocked wishes (not claimed)
  const unlockedWishes = [];
  if (state.rewards) {
    state.rewards.forEach(r => {
      if (!r.claimed && (r.allocatedPoints || 0) >= r.count && r.count > 0) {
        unlockedWishes.push({ text: r.name, icon: '🌊', isWish: true, wishId: r.id });
      }
    });
  }

  // Only use custom quotes from the user's quote library
  const allQuotes = (state.customQuotes || []).map(q => ({ text: q, icon: '✦', isWish: false }));

  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
  const TOTAL = 9;

  const rmCard = { isRandomMission: true };
  const deck = [rmCard];

  const shuffledWishes = shuffle(unlockedWishes);
  const maxWish = Math.min(3, shuffledWishes.length);
  const wishCount = maxWish > 0 ? Math.floor(Math.random() * maxWish) + 1 : 0;
  shuffledWishes.slice(0, wishCount).forEach(w => deck.push(w));

  // Fill remaining slots with custom quotes (skip if none)
  if (allQuotes.length > 0) {
    const quoteCards = shuffle(allQuotes);
    const remaining = TOTAL - 1 - wishCount;
    for (let i = 0; i < remaining; i++) deck.push(quoteCards[i % quoteCards.length]);
  } else {
    // No custom quotes: fill with blank placeholder cards showing encouragement
    const remaining = TOTAL - 1 - wishCount;
    for (let i = 0; i < remaining; i++) deck.push({ text: '前往格言庫新增你的格言', icon: '✦', isWish: false, isPlaceholder: true });
  }

  return shuffle(deck);
}

function drawLottery() {
  // 洗牌：不消耗券，隨時可用，重新組合並重置所有牌面朝下
  // 洗牌時清除隨機任務（無論是否已完成），下次翻到金卡再重新指派
  lotteryState.randomMission = null;
  const deck = buildCardPool();
  lotteryState.cards = deck.map(item => ({
    revealed: false,
    text: item.text || '',
    icon: item.icon || '',
    isWish: item.isWish || false,
    wishId: item.wishId || null,
    isRandomMission: item.isRandomMission || false,
  }));
  saveLottery();
  syncToCloud();

  const grid = document.getElementById('lotteryGrid');
  if (grid) {
    grid.classList.add('shuffling');
    setTimeout(() => {
      grid.classList.remove('shuffling');
      renderLottery();
    }, 480);
    grid.innerHTML = Array.from({length:9}, (_, i) => `
      <div class="lottery-card shuffle-anim" id="lcard-${i}" style="animation-delay:${i * 40}ms">
        <div class="lottery-card-back">
          <div class="card-face-icon">✦</div>
          <div class="card-face-hint">洗牌中…</div>
        </div>
      </div>`).join('');
  } else {
    renderLottery();
  }
}

function flipCard(i) {
  // 每次翻牌都先洗牌，播特效後翻開選的那張
  const available = lotteryState.todayDone - (lotteryState.todayFlipped || 0);
  if (available <= 0) {
    showToast('🎫 還沒有翻牌機會，完成任務來獲得！');
    return;
  }
  // Shuffle
  lotteryState.randomMission = null;
  const deck = buildCardPool();
  lotteryState.cards = deck.map(item => ({
    revealed: false,
    text: item.text || '',
    icon: item.icon || '',
    isWish: item.isWish || false,
    wishId: item.wishId || null,
    isRandomMission: item.isRandomMission || false,
  }));
  saveLottery();
  syncToCloud();
  const grid = document.getElementById('lotteryGrid');
  if (grid) {
    grid.classList.add('shuffling');
    grid.innerHTML = Array.from({length:9}, (_, idx) => `
      <div class="lottery-card shuffle-anim" id="lcard-${idx}" style="animation-delay:${idx * 40}ms">
        <div class="lottery-card-back">
          <div class="card-face-icon">✦</div>
          <div class="card-face-hint">洗牌中…</div>
        </div>
      </div>`).join('');
    setTimeout(() => {
      grid.classList.remove('shuffling');
      renderLottery();
      setTimeout(() => _doFlipCard(i), 80);
    }, 480);
  } else {
    renderLottery();
    setTimeout(() => _doFlipCard(i), 80);
  }
}

function _doFlipCard(i) {
  if (!lotteryState.cards[i] || lotteryState.cards[i].revealed) return;
  const available = lotteryState.todayDone - (lotteryState.todayFlipped || 0);
  if (available <= 0) {
    showToast('🎫 還沒有翻牌機會，完成任務來獲得！');
    return;
  }
  lotteryState.todayFlipped = (lotteryState.todayFlipped || 0) + 1;
  // Keep legacy tickets in sync for any other code that reads it
  lotteryState.tickets = Math.max(0, lotteryState.tickets - 1);
  const card = lotteryState.cards[i];
  card.revealed = true;

  // 翻到金色牌當下才指定隨機任務
  if (card.isRandomMission) {
    // 重新 generate 的條件：
    // 1. 沒有 randomMission，或上次已 awarded
    // 2. 現有任務裡，所有指派的 taskId 都已完成（今日完成前就被指派的情況）
    const existingRm = lotteryState.randomMission;
    const allAlreadyDone = existingRm && !existingRm.awarded && existingRm.taskIds &&
      existingRm.taskIds.every(id => {
        const t = state.tasks.find(x => x.id === id);
        return !t || t.done; // 找不到（已刪）或已完成
      });
    if (!existingRm || existingRm.awarded || allAlreadyDone) {
      lotteryState.randomMission = generateRandomMission();
    }
    card.missionSnapshot = lotteryState.randomMission
      ? { taskNames: lotteryState.randomMission.taskNames, requiredCount: lotteryState.randomMission.requiredCount }
      : null;
  }

  saveLottery();
  syncToCloud();

  // ── 翻到格言牌或已解鎖願望（重複）：+1 願望碎片安慰獎 ──
  if (!card.isWish && !card.isRandomMission) {
    // 格言牌（含格言和 placeholder）
    if (state.wishPoints === undefined) state.wishPoints = 0;
    state.wishPoints++;
    saveStateLocal(); // 立即寫本地，防止 sync 失敗時碎片遺失
    renderRewards();
    syncToCloud();
    showToast('🌟 +1 願望碎片（格言牌安慰獎）');
  } else if (card.isWish && card.wishId) {
    // 已是解鎖願望，會在下面兌現，不另給碎片
  }

  // ── 翻到許願牌：自動兌現願望 ──
  if (card.isWish && card.wishId) {
    const wishId = card.wishId;
    // 立即把 reward 從清單移除，防止 400ms 內重入導致雙重扣點
    const rImmediate = (state.rewards || []).find(x => x.id === wishId);
    if (!rImmediate) { /* 已被其他路徑處理，跳過 */ } else {
    state.rewards = state.rewards.filter(x => x.id !== wishId);
    const _lockedSpent = rImmediate.allocatedPoints || 0;
    const _lockedName  = rImmediate.name;
    state.wishPoints = Math.max(0, (state.wishPoints || 0) - _lockedSpent);
    setTimeout(() => {
      const wishName = _lockedName;
      const spent = _lockedSpent;
      // rewards 已在上方移除，此處只做後續 UI 與任務建立
      // 2. 清掉其他抽獎牌對此願望的引用
      if (lotteryState.cards) {
        lotteryState.cards.forEach(c2 => {
          if (c2.wishId === wishId) { c2.isWish = false; c2.wishId = null; c2.icon = '🌊'; }
        });
        saveLottery();
      }
      // 3. 新增今日任務「願望成真✨ wishName」
      const todayStr = localDateStr();
      const wishTask = {
        id: Date.now(),
        name: `願望成真✨ ${wishName}`,
        meaning: `來自許願池的願望：${wishName}`,
        goal: '日常',
        energy: 'easy',
        done: false,
        postponed: 0,
        recurring: false,
        recurMode: null,
        recurInterval: 0,
        taskDate: todayStr,
        scheduledFor: todayStr,
        status: 'active',
      };
      state.tasks.push(wishTask);
      renderRewards();
      renderTasks();
      renderTree();
      showToast(`🌊 願望成真！「${wishName}」已加入今日任務`);
      syncToCloud();
    }, 400); // slight delay so card flip animation plays first
    } // end else (rImmediate found)
  }

  const cardEl = document.getElementById('lcard-' + i);
  if (cardEl) {
    cardEl.classList.add('flipping');
    setTimeout(() => {
      cardEl.classList.remove('flipping');
      cardEl.classList.add('revealed');
      if (card.isWish) cardEl.classList.add('is-wish');
      if (card.isRandomMission) cardEl.classList.add('random-mission');
      cardEl.querySelector('.lottery-card-back').style.display = 'none';
      const front = cardEl.querySelector('.lottery-card-front');
      if (front) front.style.display = 'flex';

      // ── 中獎特效：許願牌翻開時爆發粒子 ──
      if (card.isWish) {
        const rect = cardEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let p = 0; p < 28; p++) {
          const el = document.createElement('div');
          const angle = (p / 28) * 360;
          const dist = 60 + Math.random() * 70;
          const size = 5 + Math.random() * 8;
          const dx = Math.cos(angle * Math.PI / 180) * dist;
          const dy = Math.sin(angle * Math.PI / 180) * dist;
          const colors = ['#C9A227','#F0D080','#E8C55A','#fff'];
          el.style.cssText = `
            position:fixed;left:${cx}px;top:${cy}px;
            width:${size}px;height:${size}px;border-radius:50%;
            background:${colors[p % colors.length]};
            pointer-events:none;z-index:99999;
          `;
          el.animate([
            { transform:'translate(-50%,-50%) scale(1)', opacity:1 },
            { transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(0.2)`, opacity:0 }
          ], { duration: 900 + Math.random()*300, delay: Math.random()*100, easing:'cubic-bezier(0.22,1,0.36,1)', fill:'forwards' });
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 1300);
        }
        // 文字提示
        const label = document.createElement('div');
        label.textContent = '🌊 願望成真！';
        label.style.cssText = `
          position:fixed;left:${cx}px;top:${cy - 30}px;
          transform:translate(-50%,-50%);
          color:#C9A227;font-size:18px;font-weight:800;
          white-space:nowrap;pointer-events:none;z-index:99999;
          text-shadow:0 0 20px rgba(201,162,39,0.6),0 2px 8px rgba(0,0,0,0.15);
          animation:goalFullLabel 1.8s cubic-bezier(0.22,1,0.36,1) forwards;
        `;
        document.body.appendChild(label);
        setTimeout(() => label.remove(), 1900);
      }

      renderLottery();
    }, 220);
  }
}

// ── 願望碎片兌換抽卡券 / 十連抽 ──────────────────────────────────────
function exchangeFragmentsForTicket() {
  const available = (typeof getAvailableWishPoints === 'function') ? getAvailableWishPoints() : 0;
  if (available < 10) {
    showToast(`🌟 碎片不足，需要 10 個（目前可用 ${available} 個）`);
    return;
  }
  state.wishPoints = Math.max(0, (state.wishPoints || 0) - 10);
  lotteryState.todayDone = (lotteryState.todayDone || 0) + 1;
  lotteryState.tickets = (lotteryState.tickets || 0) + 1; // legacy 同步
  saveStateLocal();
  saveLottery();
  renderRewards();
  renderLottery();
  if (typeof syncToCloud === 'function') syncToCloud();
  showToast('🎫 兌換成功！+1 抽卡券');
}
window.exchangeFragmentsForTicket = exchangeFragmentsForTicket;

// 解析「一抽」的結果（不綁定特定 DOM 卡片格，給十連抽批次呼叫用）。
// 重用 buildCardPool() 的機率分佈，所以單抽跟十連抽的中獎機率完全一致。
function _resolveOneDraw() {
  const pool = buildCardPool();
  const item = pool[Math.floor(Math.random() * pool.length)];
  const result = {
    icon: item.icon || '✦',
    text: item.text || '',
    isWish: !!item.isWish,
    isRandomMission: !!item.isRandomMission,
    fragmentGained: 0,
    wishFulfilled: null,
  };

  if (result.isRandomMission) {
    const existingRm = lotteryState.randomMission;
    const allAlreadyDone = existingRm && !existingRm.awarded && existingRm.taskIds &&
      existingRm.taskIds.every(id => {
        const t = state.tasks.find(x => x.id === id);
        return !t || t.done;
      });
    if (!existingRm || existingRm.awarded || allAlreadyDone) {
      lotteryState.randomMission = generateRandomMission();
    }
    result.text = '隨機任務卡（去任務頁查看內容）';
  } else if (result.isWish && item.wishId) {
    const wishId = item.wishId;
    const r = (state.rewards || []).find(x => x.id === wishId);
    if (r) {
      state.rewards = state.rewards.filter(x => x.id !== wishId);
      const spent = r.allocatedPoints || 0;
      state.wishPoints = Math.max(0, (state.wishPoints || 0) - spent);
      if (lotteryState.cards) {
        lotteryState.cards.forEach(c2 => {
          if (c2.wishId === wishId) { c2.isWish = false; c2.wishId = null; c2.icon = '🌊'; }
        });
      }
      const todayStr = localDateStr();
      state.tasks.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: `願望成真✨ ${r.name}`,
        meaning: `來自許願池的願望：${r.name}`,
        goal: '日常', energy: 'easy', done: false, postponed: 0,
        recurring: false, recurMode: null, recurInterval: 0,
        taskDate: todayStr, scheduledFor: todayStr, status: 'active',
      });
      result.text = `願望成真：${r.name}`;
      result.wishFulfilled = r.name;
    } else {
      // 十連抽過程中同一願望已被前面某抽兌現過，這抽退化成格言牌安慰獎
      result.isWish = false;
      if (state.wishPoints === undefined) state.wishPoints = 0;
      state.wishPoints++;
      result.fragmentGained = 1;
      result.text = '（願望已兌現過）格言牌安慰獎';
    }
  } else {
    // 格言牌 / placeholder：+1 願望碎片安慰獎
    if (state.wishPoints === undefined) state.wishPoints = 0;
    state.wishPoints++;
    result.fragmentGained = 1;
    result.text = result.text || '格言牌';
  }
  return result;
}

function drawTenPull() {
  if ((lotteryState.tenPullTickets || 0) < 1) {
    showToast('🎉 沒有十連抽券，完成限時活動任務來獲得！');
    return;
  }
  lotteryState.tenPullTickets--;
  const results = [];
  for (let i = 0; i < 10; i++) results.push(_resolveOneDraw());

  checkRandomMissionProgress();
  saveStateLocal();
  saveLottery();
  renderRewards();
  renderTasks();
  renderTree();
  renderLottery();
  if (typeof syncToCloud === 'function') syncToCloud();
  _showTenPullResultModal(results);
}
window.drawTenPull = drawTenPull;

function _showTenPullResultModal(results) {
  const old = document.getElementById('tenPullResultOverlay');
  if (old) old.remove();

  const wishResults = results.filter(r => r.wishFulfilled);
  const fragTotal = results.reduce((s, r) => s + (r.fragmentGained || 0), 0);
  const missionCount = results.filter(r => r.isRandomMission).length;

  const overlay = document.createElement('div');
  overlay.id = 'tenPullResultOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,30,45,0.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.25)">
      <div style="text-align:center;font-size:20px;font-weight:700;margin-bottom:4px">🎉 十連抽結果</div>
      <div style="text-align:center;font-size:12px;color:var(--text-faint);margin-bottom:16px">
        ${wishResults.length > 0 ? `🌊 願望成真 x${wishResults.length} · ` : ''}🌟 碎片 +${fragTotal}${missionCount > 0 ? ` · 🏆 隨機任務 x${missionCount}` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px">
        ${results.map(r => `
          <div style="aspect-ratio:1;border-radius:10px;border:1px solid ${r.wishFulfilled ? 'rgba(201,162,39,0.5)' : 'var(--border)'};background:${r.wishFulfilled ? 'rgba(201,162,39,0.12)' : 'var(--bg3)'};display:flex;align-items:center;justify-content:center;font-size:22px">
            ${r.wishFulfilled ? '🌊' : r.isRandomMission ? '🏆' : (r.icon || '✦')}
          </div>`).join('')}
      </div>
      <div style="max-height:160px;overflow-y:auto;font-size:12px;color:var(--text-dim);line-height:1.8;margin-bottom:16px;border-top:1px solid var(--border);padding-top:10px">
        ${results.map((r, idx) => `<div>${idx + 1}. ${escHtml(r.text)}</div>`).join('')}
      </div>
      <button id="tenPullCloseBtn" style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--green);color:white;font-size:14px;font-weight:600;cursor:pointer">收下 ✓</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('tenPullCloseBtn').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function renderLottery() {
  const ticketEl = document.getElementById('lotteryTickets');
  const progressEl = document.getElementById('todayDone');
  const rm = lotteryState.randomMission;
  if (!ticketEl) return;
  // available flips today
  const availableFlips = lotteryState.todayDone - (lotteryState.todayFlipped || 0);
  ticketEl.textContent = Math.max(0, availableFlips);

  // 兌換按鈕：依可用碎片數決定透明度，並把目前數量放進 title 提示
  const exBtn = document.getElementById('exchangeFragmentBtn');
  if (exBtn) {
    const available = (typeof getAvailableWishPoints === 'function') ? getAvailableWishPoints() : 0;
    exBtn.style.opacity = available >= 10 ? '1' : '0.5';
    exBtn.title = `目前可用碎片 ${available} 個，10 個碎片可兌換 1 張抽卡券`;
  }
  // 十連抽按鈕：依持有券數決定透明度，並把目前數量放進 title 提示
  const tpBtn = document.getElementById('tenPullBtn');
  if (tpBtn) {
    const cnt = lotteryState.tenPullTickets || 0;
    tpBtn.style.opacity = cnt >= 1 ? '1' : '0.5';
    tpBtn.title = `目前持有 ${cnt} 張十連抽券`;
  }

  // lotteryProgress 已移除，不顯示碎片於抽獎區

  const grid = document.getElementById('lotteryGrid');
  if (!grid) return;

  if (!lotteryState.cards || lotteryState.cards.length === 0) {
    // Persist RM slot so it doesn't jump on re-render
    if (rm && lotteryState.rmSlot === undefined) {
      lotteryState.rmSlot = Math.floor(Math.random() * 9);
      saveLottery();
    }
    const rmSlot = rm ? (lotteryState.rmSlot !== undefined ? lotteryState.rmSlot : 0) : -1;
    grid.innerHTML = Array.from({length:9}, (_, i) => `
      <div class="lottery-card" id="lcard-${i}" onclick="flipCard(${i})">
        <div class="lottery-card-back">
          <div class="card-face-icon">✦</div>
          <div class="card-face-hint">${availableFlips > 0 ? '點擊翻牌' : '等待抽獎'}</div>
        </div>
        <div class="lottery-card-front" style="display:none"></div>
      </div>`).join('');
    return;
  }

  grid.innerHTML = lotteryState.cards.map((c, i) => {
    const isRevealed = c.revealed;
    const isRM = c.isRandomMission;

    // Build random mission front content
    let rmFrontHtml = '';
    if (isRM && isRevealed) {
      const rm = lotteryState.randomMission;
      const snap = c.missionSnapshot || (rm ? { taskNames: rm.taskNames, requiredCount: rm.requiredCount } : null);
      const missionDone = rm && rm.awarded;
      if (snap) {
        const completedTaskIds = rm ? (rm.completedTaskIds || []) : [];
        const taskIds = rm ? rm.taskIds : [];
        rmFrontHtml = `
          <div class="card-reveal-icon">${missionDone ? '🏆' : '⭐'}</div>
          <div style="font-size:9px;color:var(--text-dim);letter-spacing:0.06em;margin-bottom:2px">隨機任務</div>
          <div class="rm-tasks-list">
            ${snap.taskNames.map((name, j) => {
              const done = taskIds[j] !== undefined && completedTaskIds.includes(taskIds[j]);
              return `<div class="rm-task-row${done ? ' done-task' : ''}"><span class="rm-task-check">${done ? '✓' : '○'}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px">${name}</span></div>`;
            }).join('')}
          </div>
          <div class="rm-badge" style="margin-top:4px">${missionDone ? `🎫 已獲 ${snap.requiredCount} 券` : `完成得 ${snap.requiredCount} 券`}</div>
        `;
      } else {
        rmFrontHtml = `
          <div class="card-reveal-icon">⭐</div>
          <div style="font-size:9px;color:var(--text-dim);letter-spacing:0.06em;margin-bottom:2px">隨機任務</div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:4px">目前沒有待辦任務</div>
        `;
      }
    }

    return `<div class="lottery-card${isRevealed ? ' revealed' + (c.isWish ? ' is-wish' : '') + (isRM ? ' random-mission' : '') : ''}" id="lcard-${i}" ${!isRevealed ? `onclick="flipCard(${i})"` : ''}>
      <div class="lottery-card-back" style="${isRevealed ? 'display:none' : ''}">
        <div class="card-face-icon">✦</div>
        <div class="card-face-hint">${(lotteryState.todayDone - (lotteryState.todayFlipped || 0)) > 0 ? '點擊翻牌' : '需要券'}</div>
      </div>
      <div class="lottery-card-front" style="${isRevealed ? 'display:flex' : 'display:none'}">
        ${isRM ? rmFrontHtml : `
        <div class="card-reveal-icon">${c.icon}</div>
        <div class="card-reveal-text">${c.text}</div>
        <div class="card-reveal-badge ${c.isWish ? 'wish' : 'quote'}">${c.isWish ? '★ 許願' : '格言'}</div>`}
      </div>
    </div>`;
  }).join('');
}



// ── Stats ──
function renderStats() {
  // 使用「有效今日」：00:00~重置時間 之間仍屬上個週期的今天
  const todayStr = localDateStr(new Date(getLastResetTimestamp()));
  const allDoneTasks = state.tasks.filter(t => t.done);
  const historyTasks = (state.doneHistory || []).filter(h => !h._neglectReset); // 排除重新計算天數的 sentinel
  const historyCount = historyTasks.reduce((sum, h) => sum + (h.compressed ? (h.count || 0) : 1), 0);
  // Recalculate state.done to stay in sync with actual task data
  state.done = allDoneTasks.length;
  const statsGrid = document.getElementById('statsGrid');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${allDoneTasks.length + historyCount}</div>
      <div class="stat-label">已完成任務</div>
    </div>
    <div class="stat-card stat-card-link" onclick="showPage('sandbox')" title="前往沙盒探索">
      <div class="stat-value">${state.sandbox.length}</div>
      <div class="stat-label">探索中的好奇 <span style="font-size:9px;opacity:0.6">→</span></div>
    </div>
  `;
  // Calendar heatmap — combine current done tasks + history, deduplicate by id+date
  const calContainer = document.getElementById('doneCalendarContainer');
  if (calContainer) {
    // Merge and deduplicate: tasks with completedAt take priority
    const seen = new Set();
    const calTasks = [];
    [...allDoneTasks, ...historyTasks].forEach(t => {
      if (!t.completedAt) return; // skip tasks without a completion date
      if (t._neglectReset) return; // 重新計算天數的 sentinel，不計入軌跡
      const key = (t.id || t.name) + '|' + t.completedAt;
      if (!seen.has(key)) { seen.add(key); calTasks.push(t); }
    });
    renderDoneCalendar(calTasks, calContainer);
  }
  // Done list — default: today's completed tasks only
  // Clicking the stat card (scrollToDoneList) expands to show all history
  const doneList = document.getElementById('doneList');
  const badge = document.getElementById('doneCountBadge');
  const totalDoneCount = allDoneTasks.length + historyCount;
  if (badge) badge.textContent = totalDoneCount > 0 ? `${totalDoneCount} 件` : '';
  const todayDone = allDoneTasks.filter(t => t.completedAt === todayStr);

  // Check if "show all" mode is active (toggled by clicking the stat card)
  const showAll = document.getElementById('doneList')?.dataset.showAll === 'true';

  if (!showAll) {
    // Default: today only
    if (todayDone.length === 0) {
      doneList.innerHTML = '<div style="color:var(--text-faint);font-size:13px;padding:8px;font-style:italic">今天還沒有完成任何任務，繼續加油！</div>';
    } else {
      let html = `<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">今日完成</div>`;
      html += todayDone.map(t => `
        <div class="task-item done" style="opacity:0.85">
          <div class="task-check checked" onclick="undoneTask(${t.id})" title="取消完成">✓</div>
          <div class="task-body">
            <div class="task-name" style="text-decoration:line-through;color:var(--text-dim)">${escHtml(t.name)}</div>
            <div class="task-meta">
              <span class="tag tag-goal">${escHtml(t.goal || '')}</span>
              <span style="font-size:10px;color:var(--text-faint)">${t.completedAt}</span>
            </div>
          </div>
          <span onclick="deleteTaskFromStats(${t.id})" class="btn-del-icon">×</span>
        </div>`).join('');
      doneList.innerHTML = html;
    }
    // Hide past done section in default mode
    const pastDoneSection = document.getElementById('pastDoneSection');
    if (pastDoneSection) pastDoneSection.innerHTML = '';
  } else {
    // Show-all mode: today + past
    let html = '';
    if (todayDone.length > 0) {
      html += `<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px">今日完成</div>`;
      html += todayDone.map(t => `
        <div class="task-item done" style="opacity:0.85">
          <div class="task-check checked" onclick="undoneTask(${t.id})" title="取消完成">✓</div>
          <div class="task-body">
            <div class="task-name" style="text-decoration:line-through;color:var(--text-dim)">${escHtml(t.name)}</div>
            <div class="task-meta">
              <span class="tag tag-goal">${escHtml(t.goal || '')}</span>
              <span style="font-size:10px;color:var(--text-faint)">${t.completedAt}</span>
            </div>
          </div>
          <span onclick="deleteTaskFromStats(${t.id})" class="btn-del-icon">×</span>
        </div>`).join('');
    } else {
      html += '<div style="color:var(--text-faint);font-size:13px;padding:8px;font-style:italic">今天還沒有完成任何任務，繼續加油！</div>';
    }
    doneList.innerHTML = html;

    // Past done tasks section in show-all mode — grouped by date, each date collapsible
    const pastDone = allDoneTasks.filter(t => !t.completedAt || t.completedAt !== todayStr);
    // 展開壓縮記錄為逐筆假物件，以便統一顯示
    const expandedHistory = [];
    historyTasks.forEach(h => {
      if (h.compressed) {
        (h.tasks || []).forEach((name, i) => expandedHistory.push({ id: null, name, completedAt: h.completedAt, goal: '', _fromCompressed: true, _ci: i }));
      } else {
        expandedHistory.push(h);
      }
    });
    const allHistory = [...pastDone, ...expandedHistory].filter(t => !t._neglectReset); // 排除重新計算天數的 sentinel
    const pastDoneSection = document.getElementById('pastDoneSection');
    if (pastDoneSection) {
      if (allHistory.length === 0) {
        pastDoneSection.innerHTML = '';
      } else {
        // Group by date, sorted newest first
        const byDate = {};
        allHistory.forEach(t => {
          const d = t.completedAt || '日期不明';
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(t);
        });
        const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

        let pastHtml = `<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-faint);margin:14px 0 8px;padding-top:10px;border-top:1px dashed var(--border)">過去完成</div>`;

        sortedDates.forEach((date, idx) => {
          const tasks = byDate[date];
          const groupId = 'pastGroup_' + idx;
          // Format date label
          let label = date;
          if (date !== '日期不明') {
            const [y, m, d] = date.split('-');
            label = `${parseInt(m)} 月 ${parseInt(d)} 日`;
          }
          // First group open by default, rest collapsed
          const isOpen = idx === 0;
          pastHtml += `
            <div style="margin-bottom:4px">
              <div onclick="togglePastGroup('${groupId}')" class="past-group-header">
                <span id="${groupId}_arrow" style="font-size:10px;color:var(--text-faint);transition:transform 0.2s;display:inline-block;${isOpen ? 'transform:rotate(90deg)' : ''}">▶</span>
                <span style="font-size:12px;color:var(--text-dim);font-weight:500">${label}</span>
                <span style="font-size:11px;color:var(--text-faint);margin-left:auto">${tasks.length} 件</span>
              </div>
              <div id="${groupId}" style="overflow:hidden;transition:max-height 0.28s ease;max-height:${isOpen ? '2000px' : '0'}">
                <div class="task-list" style="padding:4px 0 2px">
                  ${tasks.map(t => `
                    <div class="task-item done" style="opacity:0.7">
                      <div class="task-check checked" style="cursor:default">✓</div>
                      <div class="task-body">
                        <div class="task-name" style="text-decoration:line-through;color:var(--text-dim)">${escHtml(t.name)}</div>
                        <div class="task-meta">
                          <span class="tag tag-goal">${escHtml(t.goal || '')}</span>
                        </div>
                      </div>
                      ${t.id ? `<span onclick="deletePastDoneTask(${t.id})" class="btn-del-icon" title="從任務列表刪除（熱力圖紀錄保留）">×</span>` : ''}
                    </div>`).join('')}
                </div>
              </div>
            </div>`;
        });
        pastDoneSection.innerHTML = pastHtml;
      }
    }
  }
}

function togglePastGroup(id) {
  const el = document.getElementById(id);
  const arrow = document.getElementById(id + '_arrow');
  if (!el) return;
  const isOpen = el.style.maxHeight !== '0px' && el.style.maxHeight !== '0';
  el.style.maxHeight = isOpen ? '0' : '2000px';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function scrollToDoneList() {
  // Switch to show-all mode and re-render
  const doneList = document.getElementById('doneList');
  if (doneList) doneList.dataset.showAll = 'true';
  // Ensure the card is visible before scrolling
  const doneCard = document.getElementById('doneTasksCard');
  if (doneCard) doneCard.style.display = 'block';
  renderStats();
  // Scroll the done list card into view
  setTimeout(() => {
    if (doneCard) {
      doneCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 80);
}



function deletePastDoneTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  // Archive to doneHistory first so heatmap is preserved
  if (!state.doneHistory) state.doneHistory = [];
  const histKey = t.id + '_' + (t.completedAt || '');
  const alreadyInHistory = state.doneHistory.some(h => h.id === histKey);
  if (!alreadyInHistory) {
    state.doneHistory.push({ id: histKey, taskId: t.id, name: t.name, goal: t.goal, energy: t.energy, completedAt: t.completedAt, recurring: t.recurring || false });
  }
  // 間隔重複任務：同時刪除已排好的下次 clone
  if (t._intervalCompleted && t._intervalCloneId) {
    state.tasks = state.tasks.filter(x => x.id !== t._intervalCloneId);
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  state.done = state.tasks.filter(x => x.done).length;
  renderStats();
  renderTasks();
  renderTree();
  showToast('🗑 已從任務列表移除（熱力圖記錄保留）');
  syncToCloud();
}

function undoneTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const todayStr = localDateStr();
  if (t.completedAt !== todayStr) {
    showToast('⚠ 只能取消當日完成的任務');
    return;
  }
  // ── 間隔重複任務撤銷：刪除已排好的下次 clone，還原本任務為未完成 ──
  if (t._intervalCompleted && t._intervalCloneId) {
    state.tasks = state.tasks.filter(x => x.id !== t._intervalCloneId);
  }
  t.done = false;
  t.completedAt = null;
  t._intervalCompleted = false;
  t._intervalCloneId = null;
  state.done = state.tasks.filter(x => x.done).length;
  onTaskUncompleted(t);
  renderStats();
  renderTasks();
  renderTree();
  renderTodayPanel();
  renderRewards();
  showToast('↩ 已恢復為未完成');
  saveStateLocal();
  syncToCloud();
}

function deleteTaskFromStats(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (confirm(`確定刪除「${t.name}」嗎？`)) {
      if (t.done) {
      if (!state.doneHistory) state.doneHistory = [];
      const histKey = t.id + '_' + (t.completedAt || '');
      if (!state.doneHistory.some(h => h.id === histKey)) {
        state.doneHistory.push({ id: histKey, taskId: t.id, name: t.name, goal: t.goal, energy: t.energy, completedAt: t.completedAt, recurring: t.recurring || false });
      }
      if (state.done > 0) state.done--;
    }
    // 間隔重複任務：同時刪除已排好的下次 clone，避免孤立的 clone 留在任務列表
    if (t._intervalCompleted && t._intervalCloneId) {
      state.tasks = state.tasks.filter(x => x.id !== t._intervalCloneId);
    }
    state.tasks = state.tasks.filter(x => x.id !== id);
    renderStats();
    renderTasks();
    renderRewards();
    showToast('🗑 任務已刪除');
    saveStateLocal();
    syncToCloud();
  }
}
