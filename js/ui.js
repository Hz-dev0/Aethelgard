// ── Task Breakdown (拆解流程) ──

function openBreakdown(t) {
  if (!t.steps) t.steps = [];
  if (t.steps.length === 0) {
    t.steps.push({ name: '步驟一', done: false });
    syncToCloud();
  }
  t._breakdownOpen = true;
  renderTasks();
  // Scroll to the breakdown panel
  setTimeout(() => {
    const el = document.getElementById('breakdown-' + t.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

function toggleBreakdown(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.steps || t.steps.length === 0) return;
  t._breakdownOpen = !t._breakdownOpen;
  // Animate without full re-render
  const el = document.getElementById('breakdown-' + id);
  const arrow = document.querySelector(`#task-${id} .task-collapse-arrow`);
  if (el) el.classList.toggle('open', t._breakdownOpen);
  if (arrow) arrow.classList.toggle('open', t._breakdownOpen);
}

function addStep(e, id) {
  e.stopPropagation();
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (!t.steps) t.steps = [];
  t.steps.push({ name: '新步驟', done: false });
  renderTasks();
  // Focus the new input
  setTimeout(() => {
    const inputs = document.querySelectorAll(`#bsteps-${id} .step-name`);
    if (inputs.length) {
      const last = inputs[inputs.length - 1];
      last.focus();
      last.select();
    }
  }, 30);
  syncToCloud();
}

function deleteStep(e, id, idx) {
  e.stopPropagation();
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.steps) return;
  t.steps.splice(idx, 1);
  if (t.steps.length === 0) {
    t._breakdownOpen = false;
    delete t.steps;
  }
  renderTasks();
  syncToCloud();
}

function updateStepName(id, idx, val) {
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.steps) return;
  const s = t.steps[idx];
  const current = typeof s === 'object' ? s.name : s;
  const newName = val.trim() || current;
  if (typeof s === 'object') {
    t.steps[idx] = { ...s, name: newName };
  } else {
    t.steps[idx] = { name: newName, done: false };
  }
  syncToCloud();
}

function toggleStep(e, id, idx) {
  e.stopPropagation();
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.steps) return;
  const s = t.steps[idx];
  if (typeof s === 'object') {
    t.steps[idx] = { ...s, done: !s.done };
  } else {
    t.steps[idx] = { name: s, done: true };
  }
  // Lightweight DOM update — avoid full re-render to preserve input focus
  const stepEl = document.getElementById(`bstep-${id}-${idx}`);
  const isDone = t.steps[idx].done;
  if (stepEl) {
    const checkEl = stepEl.querySelector('.step-check');
    const nameEl = stepEl.querySelector('.step-name');
    if (checkEl) { checkEl.classList.toggle('checked', isDone); checkEl.textContent = isDone ? '✓' : ''; checkEl.title = isDone ? '取消完成' : '標記為完成'; }
    if (nameEl) nameEl.classList.toggle('step-done', isDone);
  }
  // Update progress bar
  const allSteps = t.steps;
  const doneCount = allSteps.filter(s => typeof s === 'object' ? s.done : false).length;
  const pct = allSteps.length > 0 ? Math.round(doneCount / allSteps.length * 100) : 0;
  const progressFill = document.querySelector(`#breakdown-${id} .breakdown-progress-fill`);
  const progressLabel = document.querySelector(`#breakdown-${id} .breakdown-progress-label`);
  if (progressFill) progressFill.style.width = pct + '%';
  if (progressLabel) progressLabel.textContent = `${doneCount}/${allSteps.length} 完成`;
  syncToCloud();
}

// ── Drag-to-reorder steps ──
let _dragStepTaskId = null;
let _dragStepIdx = null;

function stepDragStart(e, id, idx) {
  _dragStepTaskId = id;
  _dragStepIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById(`bstep-${id}-${idx}`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function stepDragOver(e, id, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.breakdown-step').forEach(el => el.classList.remove('drag-over'));
  const el = document.getElementById(`bstep-${id}-${idx}`);
  if (el && idx !== _dragStepIdx) el.classList.add('drag-over');
}

function stepDrop(e, id, idx) {
  e.preventDefault();
  document.querySelectorAll('.breakdown-step').forEach(el => el.classList.remove('drag-over'));
  if (_dragStepTaskId !== id || _dragStepIdx === null || _dragStepIdx === idx) return;
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.steps) return;
  const moved = t.steps.splice(_dragStepIdx, 1)[0];
  t.steps.splice(idx, 0, moved);
  _dragStepIdx = null;
  renderTasks();
  syncToCloud();
}

function stepDragEnd(e, id) {
  document.querySelectorAll('.breakdown-step').forEach(el => {
    el.classList.remove('dragging');
    el.classList.remove('drag-over');
  });
  _dragStepTaskId = null;
  _dragStepIdx = null;
}

// ── Breakdown Steps 觸控拖曳（手機）──
function _wireStepTouchDrag(taskId) {
  const container = document.getElementById('bsteps-' + taskId);
  if (!container) return;
  let _tid = null, _fromIdx = null, _clone = null, _startY = 0;

  container.querySelectorAll('.step-drag-handle').forEach(handle => {
    handle.addEventListener('touchstart', e => {
      const step = handle.closest('.breakdown-step');
      if (!step) return;
      const m = step.id.match(/bstep-\d+-(\d+)/);
      if (!m) return;
      _fromIdx = parseInt(m[1]);
      _tid = taskId;
      _startY = e.touches[0].clientY;
      const rect = step.getBoundingClientRect();
      _clone = step.cloneNode(true);
      _clone.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.82;width:' + rect.width + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;border-radius:8px;box-shadow:0 6px 20px rgba(58,110,165,0.2);transition:none';
      document.body.appendChild(_clone);
      step.classList.add('dragging');
      e.preventDefault();
    }, { passive: false });
  });

  container.addEventListener('touchmove', e => {
    if (_tid === null || !_clone) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - _startY;
    _clone.style.transform = 'translateY(' + dy + 'px)';
    container.querySelectorAll('.breakdown-step').forEach(el => el.classList.remove('drag-over'));
    const target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const targetStep = target && target.closest('.breakdown-step');
    if (targetStep) {
      const m = targetStep.id.match(/bstep-\d+-(\d+)/);
      if (m && parseInt(m[1]) !== _fromIdx) targetStep.classList.add('drag-over');
    }
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (_tid === null) return;
    if (_clone) { _clone.remove(); _clone = null; }
    container.querySelectorAll('.breakdown-step').forEach(el => el.classList.remove('dragging', 'drag-over'));
    const pt = e.changedTouches[0];
    const target = document.elementFromPoint(pt.clientX, pt.clientY);
    const targetStep = target && target.closest('.breakdown-step');
    if (targetStep) {
      const m = targetStep.id.match(/bstep-\d+-(\d+)/);
      if (m) stepDrop({ preventDefault: () => {} }, _tid, parseInt(m[1]));
    }
    _tid = null; _fromIdx = null;
  });
}

// ── Edit Task ──
let editTargetId = null;

function openEditTask(t) {
  editTargetId = t.id;
  document.getElementById('editTaskName').value = t.name;
  document.getElementById('editTaskMeaning').value = t.meaning || '';
  _setEditGoalBtn(t.goal || '技能');
  _setEditEnergyBtn(t.energy || 'easy');
  // Recurring
  const isRecurring = !!t.recurring;
  document.getElementById('editTaskDate').value = t.taskDate || '';
  const mode = t.recurMode || 'daily';
  let recurUIState = 'off';
  if (isRecurring) recurUIState = mode === 'interval' ? 'interval' : 'daily';
  _recurState['edit'] = recurUIState;
  _applyRecurUI('edit', recurUIState);
  if (isRecurring && mode === 'interval') {
    document.getElementById('editTaskInterval').value = t.recurInterval || 1;
  }
  const editRewardField = document.getElementById('editTaskReward');
  if (editRewardField) editRewardField.value = t.reward || '';
  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editTaskName').focus(), 50);
}

function saveEdit() {
  const name = document.getElementById('editTaskName').value.trim();
  if (!name) return;
  const t = state.tasks.find(x => x.id === editTargetId);
  if (!t) return;
  t.name = name;
  t.meaning = document.getElementById('editTaskMeaning').value.trim();
  t.goal = document.getElementById('editTaskGoal').value;
  t.energy = document.getElementById('editTaskEnergy').value;
  t._quickAdded = false; // 使用者已手動確認過這筆任務，移除「未整理」提示
  const editRewardEl = document.getElementById('editTaskReward');
  const editReward = editRewardEl ? editRewardEl.value.trim() : '';
  t.reward = editReward || null;
  if (editReward && window._pendingSandboxRemove && window._pendingSandboxRemove['edit'] !== undefined) {
    state.sandbox.splice(window._pendingSandboxRemove['edit'], 1);
    delete window._pendingSandboxRemove['edit'];
    renderSandbox();
  }
  // Task date
  const newTaskDate = document.getElementById('editTaskDate').value || null;
  t.taskDate = newTaskDate || null;
  const todayStr = localDateStr();
  // If date is set to today and not already scheduled, auto-mark
  if (newTaskDate && newTaskDate === todayStr && !t.scheduledFor && !t.done) {
    t.scheduledFor = todayStr;
    t.status = 'active';
  }
  // If date was cleared or changed away from today, clear scheduled if it was set by taskDate
  if (!newTaskDate && t._scheduledByDate) {
    t.scheduledFor = null;
    t.status = null;
    t._scheduledByDate = false;
  }
  const isRecurring = document.getElementById('editTaskRecurring').value === 'true';
  t.recurring = isRecurring;
  if (isRecurring) {
    const modeHidden = document.getElementById('editRecurModeHidden');
    const mode = modeHidden ? modeHidden.value : 'daily';
    t.recurMode = mode;
    t.recurInterval = mode === 'interval' ? (parseInt(document.getElementById('editTaskInterval').value) || 1) : 0;
  } else {
    t.recurMode = null;
    t.recurInterval = 0;
  }
  closeModal('editModal');
  // ★ Fix：編輯儲存後呼叫 checkTaskDates，確保日期設為今天（或已到期）的任務立即排入今日面板
  checkTaskDates();
  renderTasks(); renderStats();
  showToast('✦ 任務已更新');
  syncToCloud();
}

// ── Modal / Toast utils ──
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

// Close modal on overlay click (except addModal and editModal — only cancel button closes them)
document.querySelectorAll('.modal-overlay').forEach(o => {
  if (o.id === 'editModal' || o.id === 'addModal') return;
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ── 手機鍵盤彈出時，通用防遮擋處理 ──
// 涵蓋：所有 .modal-overlay、#routineOverlay、#routinePanel、
//        #recurMorningOverlay、.api-modal-overlay、#page-notes、
//        以及頁面主內容區（main）內的輸入欄
(function() {
  // 找出「目前正在顯示且含有 focus 元素的 overlay 容器」
  // 若 focus 元素在某個 fixed 容器內，回傳該容器；否則回傳 null（代表在 main 捲動區）
  function findActiveOverlay(el) {
    // 依優先順序嘗試各種 overlay 選擇器
    return (
      el.closest('.modal-overlay.open') ||
      el.closest('#routineOverlay.open') ||
      el.closest('#recurMorningOverlay.open') ||
      el.closest('.api-modal-overlay.open') ||
      el.closest('#notes-dlg-overlay.visible') ||
      null
    );
  }

  // 對 overlay 容器本身（fixed 定位）依 visualViewport 調整高度+位移
  function adjustOverlay(overlay) {
    if (!overlay || !window.visualViewport) return;
    const vv = window.visualViewport;
    overlay.style.height = vv.height + 'px';
    overlay.style.top    = vv.offsetTop + 'px';
  }

  // 還原 overlay 高度（鍵盤收起後呼叫）
  function resetOverlay(overlay) {
    if (!overlay) return;
    overlay.style.height = '';
    overlay.style.top    = '';
  }

  // 把 focus 元素捲入可視區（給瀏覽器完成 layout 的時間）
  function scrollIntoView(el) {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }

  // 目前正在被調整的 overlay（用於鍵盤收起時還原）
  let _activeOverlay = null;

  if (window.visualViewport) {
    // 鍵盤彈出 / 收起：visualViewport.height 改變
    window.visualViewport.addEventListener('resize', () => {
      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName;

      // Notes 頁面 textarea：page-notes 本身是 fixed，直接 scrollIntoView 即可
      if (el.closest('#page-notes')) {
        scrollIntoView(el);
        return;
      }

      const overlay = findActiveOverlay(el);
      if (overlay) {
        _activeOverlay = overlay;
        adjustOverlay(overlay);
        scrollIntoView(el);
      } else if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // 在 main 捲動區的輸入欄（例如沙盒輸入）：直接 scrollIntoView
        scrollIntoView(el);
      }
    });

    // visualViewport 位移（部分 Android 鍵盤實作）
    window.visualViewport.addEventListener('scroll', () => {
      if (_activeOverlay) {
        _activeOverlay.style.top = window.visualViewport.offsetTop + 'px';
      }
    });
  }

  // focusin：任何輸入欄獲得 focus 時也觸發一次
  document.addEventListener('focusin', (e) => {
    const tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;

    if (e.target.closest('#page-notes')) {
      scrollIntoView(e.target);
      return;
    }

    const overlay = findActiveOverlay(e.target);
    if (overlay) {
      _activeOverlay = overlay;
      // 若 visualViewport 已縮小（鍵盤已開），立即調整
      if (window.visualViewport && window.visualViewport.height < window.innerHeight * 0.85) {
        adjustOverlay(overlay);
      }
      scrollIntoView(e.target);
    }
  });

  // focusout：鍵盤收起，還原所有 overlay
  document.addEventListener('focusout', () => {
    // 延遲確認焦點沒有移到另一個輸入欄
    setTimeout(() => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (_activeOverlay) {
        resetOverlay(_activeOverlay);
        _activeOverlay = null;
      }
    }, 200);
  });

  // 用 MutationObserver 監聽所有 overlay 關閉，強制還原高度
  // （處理程式呼叫 classList.remove('open') 關閉 modal 的情況）
  const overlaySelectors = [
    '.modal-overlay', '#routineOverlay', '#recurMorningOverlay',
    '.api-modal-overlay', '#notes-dlg-overlay'
  ];
  overlaySelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(o => {
      new MutationObserver(() => {
        const isOpen = o.classList.contains('open') || o.classList.contains('visible');
        if (!isOpen) {
          resetOverlay(o);
          if (_activeOverlay === o) _activeOverlay = null;
        }
      }).observe(o, { attributes: true, attributeFilter: ['class'] });
    });
  });
})();


// ── 手機：任務長按開啟 context menu ──
function _wireTaskLongPress() {
  document.querySelectorAll('.task-item').forEach(el => {
    const m = el.id && el.id.match(/task-(\d+)/);
    if (!m) return;
    const id = parseInt(m[1]);
    // 長按 600ms 觸發 context menu（模擬桌機右鍵）
    attachLongPress(el, () => {
      if (navigator.vibrate) navigator.vibrate(40);
      // 合成一個假的 event 讓 openCtxMenu 定位到元素中心
      const rect = el.getBoundingClientRect();
      const fakeEvent = {
        stopPropagation: () => {},
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      openCtxMenu(fakeEvent, id);
    });
  });
}

// ── 手機：任務左滑顯示快速操作（刪除 / 完成）──
(function _initSwipeTask() {
  let _sx = 0, _sy = 0, _el = null, _id = null, _swiping = false, _overlay = null;

  document.addEventListener('touchstart', e => {
    const taskEl = e.target.closest('.task-item');
    if (!taskEl) return;
    // 若點到 check、stripe、icon 按鈕不觸發滑動
    if (e.target.closest('.task-check,.task-stripe,.task-icon-btn,.step-check,.step-del,.breakdown-add-btn,.task-collapse-arrow')) return;
    const m = taskEl.id && taskEl.id.match(/task-(\d+)/);
    if (!m) return;
    _el = taskEl;
    _id = parseInt(m[1]);
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
    _swiping = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_el) return;
    const dx = e.touches[0].clientX - _sx;
    const dy = Math.abs(e.touches[0].clientY - _sy);
    if (!_swiping && dy > 10) { _el = null; return; } // 縱向滑動，取消
    if (!_swiping && Math.abs(dx) > 12) _swiping = true;
    if (!_swiping) return;
    if (dx < -10 && dx > -90) {
      _el.style.transform = 'translateX(' + Math.max(dx, -80) + 'px)';
      _el.style.transition = 'none';
      // 顯示刪除提示背景
      if (!_overlay) {
        _overlay = document.createElement('div');
        _overlay.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:80px;display:flex;align-items:center;justify-content:center;background:rgba(192,86,90,0.88);border-radius:0 8px 8px 0;color:#fff;font-size:13px;font-weight:600;pointer-events:none;z-index:2;border-radius:0 8px 8px 0';
        _overlay.textContent = '🗑 刪除';
        _el.style.position = 'relative';
        _el.appendChild(_overlay);
      }
    } else if (dx >= 0) {
      _resetSwipe();
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!_el || !_swiping) { _el = null; _id = null; return; }
    const dx = e.changedTouches[0].clientX - _sx;
    if (dx < -55) {
      // 滑超過 55px → 確認刪除
      if (navigator.vibrate) navigator.vibrate(30);
      _el.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      _el.style.transform = 'translateX(-100%)';
      _el.style.opacity = '0';
      const delId = _id;
      setTimeout(() => {
        // reuse ctxAction 刪除邏輯
        ctxTargetId = delId;
        ctxAction('delete');
      }, 220);
    } else {
      _resetSwipe();
    }
    _el = null; _id = null; _swiping = false;
  });

  function _resetSwipe() {
    if (!_el) return;
    _el.style.transition = 'transform 0.2s ease';
    _el.style.transform = '';
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }
})();
(function() {
  let _swipeStartX = 0;
  let _swipeStartY = 0;
  let _swipeActive = false;

  document.addEventListener('touchstart', function(e) {
    const touch = e.touches[0];
    _swipeStartX = touch.clientX;
    _swipeStartY = touch.clientY;
    // 只在畫面左側 30px 內開始的滑動才算「上一頁手勢」（避免與頁內橫向捲動衝突）
    _swipeActive = touch.clientX <= 30;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!_swipeActive) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - _swipeStartX;
    const deltaY = Math.abs(touch.clientY - _swipeStartY);
    // 橫向位移 > 60px 且縱向位移 < 80px，視為向右滑動（上一頁）
    if (deltaX > 60 && deltaY < 80) {
      // 若 notes 頁面可見，回到先前頁面
      if (typeof _notesIsVisible !== 'undefined' && _notesIsVisible) {
        const prevPage = window._notesPrevPage || 'tree';
        showPage(prevPage);
      } else {
        // 一律回到生命樹
        showPage('tree');
      }
    }
    _swipeActive = false;
  }, { passive: true });
})();
