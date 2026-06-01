// ── Context Menu ──
let ctxTargetId = null;

function openCtxMenu(e, id) {
  e.stopPropagation();
  ctxTargetId = id;
  const t = state.tasks.find(x => x.id === id);
  const menu = document.getElementById('ctxMenu');
  const toggleItem = document.getElementById('ctxToggle');
  toggleItem.textContent = t.done ? '↩ 取消完成' : '✓ 標記完成';
  // Position off-screen first so we can measure real height
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';
  menu.classList.add('open');
  requestAnimationFrame(() => {
    const menuH = menu.offsetHeight || 160;
    const menuW = menu.offsetWidth || 160;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = e.clientY + menuH > window.innerHeight - 8
      ? e.clientY - menuH
      : e.clientY;
    menu.style.left = Math.max(8, x) + 'px';
    menu.style.top = Math.max(8, y) + 'px';
  });
}

function ctxAction(action) {
  const menu = document.getElementById('ctxMenu');
  menu.classList.remove('open');
  const _targetId = typeof ctxTargetId === 'string' ? parseInt(ctxTargetId, 10) : ctxTargetId;
  const t = state.tasks.find(x => x.id === _targetId || String(x.id) === String(_targetId));
  if (!t) return;
  if (action === 'edit') openEditTask(t);
  if (action === 'breakdown') openBreakdown(t);
  if (action === 'toggle') {
    toggleTask(_targetId);
    return;
  }
  if (action === 'delete') {
    if (t.done && t.energy !== 'charge') {
      if (state.wishPoints === undefined) state.wishPoints = 0;
      state.wishPoints = Math.max(0, state.wishPoints - 1);
    }
    if (t.done && state.done > 0) state.done--;
    state.tasks = state.tasks.filter(x => String(x.id) !== String(_targetId));
    renderAll();
    showToast('🗑 任務已移除');
    syncToCloud();
  }
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('ctxMenu');
  if (menu && !menu.contains(e.target)) menu.classList.remove('open');
});
