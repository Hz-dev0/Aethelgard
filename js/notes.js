const NOTES_STORAGE_KEY = 'aethelgard_notes_v1';

// ── 分頁唯一 id 產生器（用來讓「同一個分頁」跨裝置時可以被正確辨識）──
function _notesGenId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ── 分頁刪除標記（tombstone）：[{id, deletedAt}]
// 目的：避免「筆記分頁在一台裝置刪除、另一台裝置離線很久才回來同步」時，
// 舊裝置手上還留著的那個分頁被合併邏輯誤判為「新增的分頁」而復活。
window._notesDeletedTabIds = window._notesDeletedTabIds || [];
function _notesTrimDeletedLog() {
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  window._notesDeletedTabIds = (window._notesDeletedTabIds || []).filter(e => e.deletedAt >= cutoff);
}
function _notesMergeDeletedLogs(a, b) {
  const map = {};
  [...(a || []), ...(b || [])].forEach(e => {
    if (!e || e.id === undefined) return;
    if (!map[e.id] || e.deletedAt > map[e.id].deletedAt) map[e.id] = e;
  });
  return Object.values(map);
}

// ── State ──────────────────────────────────────────────
let notesFolderData   = [];
let notesTabIndex     = 0;
let notesSaveTimer    = null;
let _notesIsVisible   = false;
// ── 旗標：是否已從雲端或本地成功載入過筆記資料。
// 未載入前 notesFolderData 是空陣列，sync 時應省略 notes 欄位讓 GAS 保留雲端資料。
// 載入後即使筆記是空白頁，也要送出（代表使用者的真實狀態）。
let _notesLoaded = false;

// ── Window accessor: 讓 IIFE 外的 _doSyncToCloud 安全讀取 IIFE 內部的 notes 狀態 ──
window._notesGetSyncPayload = function() {
  if (!_notesLoaded) return undefined; // 尚未載入，不送（讓 GAS 保留雲端資料）
  if (!Array.isArray(notesFolderData) || notesFolderData.length === 0) return undefined;
  // ★ fix：不用 Date.now() fallback，避免每次呼叫都產生新時間戳導致 hash 永遠不同
  // _notesMemUpdatedAt 只在使用者實際編輯（syncNotesToCloud）後才更新
  return {
    tabs: notesFolderData,
    lastTab: typeof notesTabIndex === 'number' ? notesTabIndex : 0,
    lastViewedTab:  notesTabIndex,
    lastViewedPage: notesFolderData[notesTabIndex]?.currentPage ?? 0,
    updatedAt: window._notesMemUpdatedAt || 0,
    deletedTabIds: window._notesDeletedTabIds || []
  };
};

const _notesDlg = (() => {
  let _res = null;
  const ov  = () => document.getElementById('notes-dlg-overlay');
  const ti  = () => document.getElementById('notes-dlg-title');
  const inp = () => document.getElementById('notes-dlg-input');

  function _open(title, { isConfirm=false, defaultVal='' } = {}) {
    if (_res) { const old=_res; _res=null; _cleanup(); old(null); }
    return new Promise(resolve => {
      _res = resolve;
      ti().textContent = title;
      const cnBtn = document.getElementById('notes-dlg-cancel');
      if (isConfirm) {
        inp().style.display = 'none';
        if (cnBtn) cnBtn.style.display = 'inline-block';
      } else {
        inp().style.display = 'block';
        inp().value = defaultVal;
        if (cnBtn) cnBtn.style.display = '';
        setTimeout(() => { inp().focus(); inp().select(); }, 80);
      }
      ov().classList.add('visible');
      inp()._kd = e => {
        if (e.key==='Enter')  { e.preventDefault(); _confirm(); }
        if (e.key==='Escape') { e.preventDefault(); _cancel(); }
      };
      inp().addEventListener('keydown', inp()._kd);
    });
  }
  function _cleanup() {
    ov().classList.remove('visible');
    if (inp()._kd) inp().removeEventListener('keydown', inp()._kd);
  }
  function _confirm() {
    const val = inp().style.display !== 'none' ? inp().value : true;
    _cleanup(); if (_res) { _res(val); _res=null; }
  }
  function _cancel() {
    _cleanup(); if (_res) { _res(null); _res=null; }
  }
  return {
    prompt:  (t, d='') => _open(t, { defaultVal: d }),
    confirm: (t)       => _open(t, { isConfirm: true }),
    _confirm, _cancel
  };
})();
window._notesDlg = _notesDlg;

// ── Persistence ────────────────────────────────────────
function notesSave() {
  try { notesFlush(); } catch(e) {}
  const _saveTs = Date.now();
  // ★ 幫目前正在編輯的分頁蓋上自己的更新時間戳，讓合併邏輯可以「以分頁為單位」
  // 判斷新舊，而不是整份筆記比一個時間戳（見 _pickNotes）。
  const _curTab = notesFolderData[notesTabIndex];
  if (_curTab) {
    if (!_curTab.id) _curTab.id = _notesGenId();
    _curTab.updatedAt = _saveTs;
  }
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({
      tabs: notesFolderData,
      lastTab: notesTabIndex,
      // ★ 直接存當下位置，確保重整後也能回到正確的 tab/page
      lastViewedTab:  notesTabIndex,
      lastViewedPage: notesFolderData[notesTabIndex]?.currentPage ?? 0,
      updatedAt: _saveTs,
      deletedTabIds: window._notesDeletedTabIds || []
    }));
  } catch(e) {}
  // ★ fix：確保 _notesMemUpdatedAt 與 localStorage updatedAt 一致
  // 讓 _pickNotes 和 snapshot 比對時拿到同一個時間戳
  window._notesMemUpdatedAt = _saveTs;
  try {
    if (typeof syncNotesToCloud === 'function') syncNotesToCloud();
  } catch(e) {}
  // 顯示已保存提示
  const ind = document.getElementById('notes-saved-indicator');
  if (ind) {
    ind.style.opacity = '1';
    clearTimeout(ind._hideTimer);
    ind._hideTimer = setTimeout(() => { ind.style.opacity = '0'; }, 1800);
  }
}

function notesLoad() {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) {
      // localStorage 無資料（可能是無痕模式）→ 若記憶體已有雲端資料則保留，不覆蓋
      return;
    }
    const d = JSON.parse(raw);
    if (d.tabs && d.tabs.length > 0) {
      // localStorage 有資料時，比較時間戳，保留較新的版本
      const localTs = d.updatedAt || 0;
      const memTs = window._notesMemUpdatedAt || 0;
      if (memTs > localTs && notesFolderData.length > 0) {
        // 記憶體版本較新（無痕模式下雲端同步後的資料）→ 保留記憶體，不覆蓋
        return;
      }
      notesFolderData = d.tabs;
      notesTabIndex = Math.min(typeof d.lastViewedTab === 'number' ? d.lastViewedTab : (d.lastTab || 0), notesFolderData.length - 1);
      const _restoredTab = notesFolderData[notesTabIndex];
      if (_restoredTab && typeof d.lastViewedPage === 'number') {
        _restoredTab.currentPage = Math.min(d.lastViewedPage, (_restoredTab.pages?.length || 1) - 1);
      }
      window._notesDeletedTabIds = _notesMergeDeletedLogs(window._notesDeletedTabIds, d.deletedTabIds);
      _notesLoaded = true;
    }
  } catch(e) {
    // localStorage 不可用（無痕模式）或資料損毀 → 保持記憶體現有資料
  }
}

// ── Public: reload from localStorage (called after cloud sync) ──
function notesReloadFromStorage() {
  // 若筆記頁正在顯示，保護使用者的操作位置，不重新載入（雲端已透過 notesLoadFromData 合併）
  if (_notesIsVisible) return;
  notesLoad();
  notesEnsureDefaults();
  notesRenderTabs();
}
window.notesReloadFromStorage = notesReloadFromStorage;

// ── 直接從雲端 notes 物件載入到記憶體，繞過 localStorage（無痕模式 fallback）──
function notesLoadFromData(notes) {
  if (!notes || !Array.isArray(notes.tabs) || notes.tabs.length === 0) return;
  window._notesDeletedTabIds = _notesMergeDeletedLogs(window._notesDeletedTabIds, notes.deletedTabIds);

  // ── 保護使用者正在操作的頁面位置 ──
  // 若筆記頁正在顯示（使用者可能正在翻頁），保留記憶體中的 currentPage，
  // 只更新筆記文字內容，避免被雲端的舊 currentPage 蓋回去。
  if (_notesIsVisible && notesFolderData.length > 0) {
    // 合併：保留本地每個 tab 的 currentPage，只更新內容
    const mergedTabs = notes.tabs.map((cloudTab, i) => {
      const localTab = notesFolderData[i];
      if (localTab && typeof localTab.currentPage === 'number') {
        // 保留本地 currentPage（使用者正在瀏覽的位置）
        return { ...cloudTab, currentPage: Math.min(localTab.currentPage, (cloudTab.pages || []).length - 1) };
      }
      return cloudTab;
    });
    notesFolderData = mergedTabs;
    // 保留本地 tabIndex（使用者正在看的分頁）
    notesTabIndex = Math.min(notesTabIndex, notesFolderData.length - 1);
  } else {
    notesFolderData = notes.tabs;
    notesTabIndex = Math.min(typeof notes.lastViewedTab === 'number' ? notes.lastViewedTab : (notes.lastTab || 0), notesFolderData.length - 1);
    const _restoredTab = notesFolderData[notesTabIndex];
    if (_restoredTab && typeof notes.lastViewedPage === 'number') {
      _restoredTab.currentPage = Math.min(notes.lastViewedPage, (_restoredTab.pages?.length || 1) - 1);
    }
  }

  _notesLoaded = true; // 已從雲端載入，後續 sync 可安全帶上 notes
  notesEnsureDefaults();
  // ── 只有筆記頁不在前景時才重新渲染，避免打斷使用者操作 ──
  if (_notesIsVisible) {
    // 靜默更新：flush 目前編輯中的文字到 notesFolderData，再重渲染
    // 但不重置頁碼顯示（notesRenderTabs 會依 currentPage 顯示，currentPage 已被保護）
    notesRenderTabs();
  }
}
window.notesLoadFromData = notesLoadFromData;


// ── 清除所有筆記資料（給 clearApiUrl 呼叫）──
// 不依賴筆記 section 是否已掛載到 DOM，確保無論使用者有無開啟過筆記都能完整淨空
function notesClearAll() {
  // 1. 取消 pending auto-save，防止清空後舊資料被寫回
  clearTimeout(notesSaveTimer);
  notesSaveTimer = null;
  // 2. 重置記憶體資料（使用者主動斷線，重置 loaded 旗標）
  _notesLoaded = false;
  window._notesMemUpdatedAt = 0;
  window._notesUserEdited = false;
  notesFolderData = [{ name: '筆記', pages: [{ titleA:'', a:'', titleB:'', b:'' }], currentPage: 0 }];
  notesTabIndex = 0;
  // 3. 直接清空所有筆記相關 DOM（無論是否可見）
  ['notesTitleA','notesTextA','notesTitleB','notesTextB'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const preA = document.getElementById('notes-md-preview-a');
  const preB = document.getElementById('notes-md-preview-b');
  if (preA) preA.innerHTML = '';
  if (preB) preB.innerHTML = '';
  // 4. 若 section 已掛載，重新渲染 tab 列與頁面內容
  if (typeof notesEnsureDefaults === 'function') notesEnsureDefaults();
  if (typeof notesRenderTabs === 'function') notesRenderTabs();
}
window.notesClearAll = notesClearAll;

function notesEnsureDefaults() {
  if (notesFolderData.length === 0) {
    notesFolderData = [{ name: '筆記', pages: [{ titleA:'', a:'', titleB:'', b:'' }], currentPage: 0 }];
  }
  let _idBackfilled = false;
  notesFolderData.forEach(tab => {
    if (!tab.pages) tab.pages = [{ titleA:'', a:'', titleB:'', b:'' }];
    if (typeof tab.currentPage !== 'number') tab.currentPage = 0;
    if (!tab.id) { tab.id = _notesGenId(); _idBackfilled = true; } // 舊資料補上唯一 id，供跨裝置合併辨識用
  });
  // ★ fix：id 一旦補上就立刻寫回 localStorage，避免下次載入時又重新產生「不一樣」的 id，
  // 導致 _pickNotes 用 id 比對時把同一個分頁誤判成兩個不同分頁而複製。
  if (_idBackfilled) {
    try {
      const raw = localStorage.getItem(NOTES_STORAGE_KEY);
      const d = raw ? JSON.parse(raw) : {};
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({
        ...d,
        tabs: notesFolderData,
      }));
    } catch(e) {}
  }
}

// ── Auto-save ──────────────────────────────────────────
function notesAutoSave() {
  notesFlush();
  // ★ Bug 3 fix：標記本 session 使用者確實編輯過，讓 _pickNotes 知道記憶體版本是真實的
  window._notesUserEdited = true;
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(notesSave, 600);
}

function notesFlush() {
  const tab = notesFolderData[notesTabIndex];
  if (!tab || !tab.pages) return;
  const pg = tab.pages[tab.currentPage];
  if (!pg) return;
  pg.titleA = document.getElementById('notesTitleA')?.value ?? pg.titleA;
  pg.a      = document.getElementById('notesTextA')?.value  ?? pg.a;
  pg.titleB = document.getElementById('notesTitleB')?.value ?? pg.titleB;
  pg.b      = document.getElementById('notesTextB')?.value  ?? pg.b;
}

// ── MD Preview state ───────────────────────────────────
const _notesMdState = { A: true, B: true };

function _notesMdParse(text) {
  // ── ::: 折疊區塊：:::標題\n內容\n::: → <details><summary>標題</summary>內容</details>
  let src = (text || '').replace(
    /^:::([^\n]*)\n([\s\S]*?)^:::/gm,
    (_, title, body) =>
      `<details><summary>${title.trim()}</summary>\n\n${body.trim()}\n\n</details>`
  );
  const processed = src.replace(/^[ \t]*(---+|===+|\*\*\*+)[ \t]*$/gm, '\n\n$1\n\n');
  let raw;
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.link = (href, title, text) => {
      const hrefStr  = (typeof href === 'object' && href !== null) ? (href.href  || '') : (href  || '');
      const titleStr = (typeof href === 'object' && href !== null) ? (href.title || '') : (title || '');
      const textStr  = (typeof href === 'object' && href !== null) ? (href.text  || text || '') : (text || '');
      const titleAttr = titleStr ? ` title="${titleStr}"` : '';
      return `<a href="${hrefStr}" target="_blank" rel="noopener noreferrer"${titleAttr}>${textStr}</a>`;
    };
    raw = marked.parse(processed, { breaks: true, gfm: true, renderer });
  } else {
    raw = processed.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p','br','b','strong','i','em','u','s','del','mark','span','div',
                     'h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','hr',
                     'table','thead','tbody','tr','th','td','code','pre','a',
                     'details','summary'],
      ALLOWED_ATTR: ['href','target','rel','style','class','open'],
      ALLOW_DATA_ATTR: false
    });
  }
  return raw;
}

function notesToggleMd(side) {
  const ta  = document.getElementById('notesText' + side);
  const pre = document.getElementById('notes-md-preview-' + side.toLowerCase());
  const btn = document.getElementById('notes-md-toggle-' + side.toLowerCase());
  if (!ta || !pre) return;
  _notesMdState[side] = !_notesMdState[side];
  const on = _notesMdState[side];
  ta.style.display = on ? 'none' : '';
  pre.classList.toggle('show', on);
  btn?.classList.toggle('active', on);
  btn?.setAttribute('title', on ? '切回編輯模式' : '切換 Markdown 預覽');
  if (on) {
    pre.innerHTML = _notesMdParse(ta.value || '');
    const toolbar = document.getElementById('notes-md-toolbar');
    if (toolbar) toolbar.classList.remove('show');
  } else {
    setTimeout(() => ta.focus(), 40);
  }
}

function notesLiveMd(side) {
  if (!_notesMdState[side]) return;
  const ta  = document.getElementById('notesText' + side);
  const pre = document.getElementById('notes-md-preview-' + side.toLowerCase());
  if (ta && pre) pre.innerHTML = _notesMdParse(ta.value || '');
}
window.notesToggleMd = notesToggleMd;
window.notesLiveMd   = notesLiveMd;
window.notesAutoSave = notesAutoSave;

function notesRefreshPreviews() {
  ['A','B'].forEach(side => {
    const ta  = document.getElementById('notesText' + side);
    const pre = document.getElementById('notes-md-preview-' + side.toLowerCase());
    const btn = document.getElementById('notes-md-toggle-' + side.toLowerCase());
    if (!ta || !pre) return;
    if (_notesMdState[side]) {
      pre.innerHTML = _notesMdParse(ta.value || '');
      ta.style.display = 'none';
      pre.ondblclick = null;
      pre.classList.add('show');
      if (btn) { btn.classList.add('active'); btn.setAttribute('title','切回編輯模式'); }
    } else {
      ta.style.display = '';
      pre.classList.remove('show');
      if (btn) { btn.classList.remove('active'); btn.setAttribute('title','切換 Markdown 預覽'); }
      pre.ondblclick = null;
    }
  });
}

// ── Render tabs (with pointer-based drag-to-reorder) ──────────────────────────
// Uses Pointer Events instead of HTML5 drag API — works reliably in overflow
// containers and with child elements.

let _tabPointerDrag = null; // 保留供外部相容，不再使用
let _tabJustDragged = false; // 拖曳完成後短暫阻止 onclick

function _notesTabPointerDown(e, div, row) {
  if (e.button !== undefined && e.button !== 0) return; // left button only
  if (e.target.classList.contains('tab-del-btn')) return;

  const fromIdx = parseInt(div.dataset.tabIdx);
  const startX = e.clientX;
  const startY = e.clientY;
  const pointerId = e.pointerId;
  let dragState = 'pending'; // 'pending' | 'dragging-tab' | 'scrolling' | 'cancelled'
  let clone = null;
  let insertMarker = null;

  // 長按才啟動拖曳：先等 300ms，期間若手指明顯移動則判斷為捲軸
  let longPressTimer = setTimeout(() => {
    if (dragState === 'pending') {
      // 確認啟動 tab 拖曳：此時再做 pointer capture
      dragState = 'dragging-tab';
      if (navigator.vibrate) navigator.vibrate(25);
      div.setPointerCapture && div.setPointerCapture(pointerId);
    }
  }, 300);

  function cleanup() {
    clearTimeout(longPressTimer);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup',   onUp);
    document.removeEventListener('pointercancel', onCancel);
    if (clone)        { clone.remove();        clone = null; }
    if (insertMarker) { insertMarker.remove();  insertMarker = null; }
    div.style.opacity = '';
    row.querySelectorAll('.notes-tab').forEach(el => el.classList.remove('tab-drag-over'));
  }

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dragState === 'pending') {
      if (dist < 6) return; // 還沒動夠，等等
      // TAB 為水平排列，水平移動即為拖曳方向，直接啟動拖曳
      // 只有當垂直分量明顯大於水平分量時，才視為頁面捲動操作
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        dragState = 'scrolling';
        clearTimeout(longPressTimer);
        cleanup();
        return;
      }
      // 水平或斜向移動：直接啟動拖曳（不等長按）
      dragState = 'dragging-tab';
      clearTimeout(longPressTimer);
      if (navigator.vibrate) navigator.vibrate(25);
      div.setPointerCapture && div.setPointerCapture(pointerId);
    }

    if (dragState !== 'dragging-tab') return;

    // 第一次進入拖曳：建立 clone 和 marker
    if (!clone) {
      const rect = div.getBoundingClientRect();
      clone = div.cloneNode(true);
      clone.style.cssText = [
        'position:fixed',
        'z-index:99999',
        'pointer-events:none',
        'opacity:0.85',
        'width:' + rect.width + 'px',
        'left:' + rect.left + 'px',
        'top:' + rect.top + 'px',
        'border-radius:8px 8px 0 0',
        'box-shadow:0 4px 16px rgba(58,110,165,0.3)',
        'transition:none',
        'cursor:grabbing',
        'background:var(--bg2)',
        'border:1px solid rgba(58,110,165,0.35)'
      ].join(';');
      document.body.appendChild(clone);
      div.style.opacity = '0.3';

      insertMarker = document.createElement('div');
      insertMarker.style.cssText = 'width:3px;height:28px;background:var(--green);border-radius:3px;flex-shrink:0;pointer-events:none;align-self:center;display:none;';
      document.body.appendChild(insertMarker);
    }

    // 移動 clone
    clone.style.left = ev.clientX - (div.getBoundingClientRect().width / 2) + 'px';

    // 找目標 tab
    row.querySelectorAll('.notes-tab').forEach(el => el.classList.remove('tab-drag-over'));
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.notes-tab');
    if (target && target !== div) {
      target.classList.add('tab-drag-over');
      const tr = target.getBoundingClientRect();
      const half = ev.clientX < tr.left + tr.width / 2;
      insertMarker.style.cssText = insertMarker.style.cssText
        .replace(/position:[^;]+;?/g, '')
        .replace(/top:[^;]+;?/g, '')
        .replace(/left:[^;]+;?/g, '');
      insertMarker.style.cssText += ';position:fixed;top:' + (tr.top + 4) + 'px;left:' + (half ? tr.left - 3 : tr.right - 1) + 'px';
      insertMarker.style.display = 'block';
    } else {
      if (insertMarker) insertMarker.style.display = 'none';
    }
  }

  function onUp(ev) {
    const wasDragging = dragState === 'dragging-tab' && clone !== null;
    const lastX = ev.clientX, lastY = ev.clientY;
    cleanup();

    if (!wasDragging) return; // was a click or scroll — onclick will handle it

    const target = document.elementFromPoint(lastX, lastY)?.closest?.('.notes-tab');
    if (!target || target === div) return;

    const toIdx = parseInt(target.dataset.tabIdx);
    const tr = target.getBoundingClientRect();
    const insertBefore = lastX < tr.left + tr.width / 2;
    const finalIdx = insertBefore ? toIdx : toIdx + (toIdx > fromIdx ? 0 : 1);

    // 標記拖曳完成，阻止緊接的 onclick 切換分頁
    _tabJustDragged = true;
    setTimeout(() => { _tabJustDragged = false; }, 300);

    notesFlush();
    const [movedTab] = notesFolderData.splice(fromIdx, 1);
    const adjustedIdx = finalIdx > fromIdx ? finalIdx - 1 : finalIdx;
    notesFolderData.splice(Math.max(0, Math.min(adjustedIdx, notesFolderData.length)), 0, movedTab);
    notesTabIndex = notesFolderData.indexOf(movedTab);
    notesRenderTabs();
    notesSave();
  }

  function onCancel() {
    cleanup();
  }

  document.addEventListener('pointermove',   onMove);
  document.addEventListener('pointerup',     onUp);
  document.addEventListener('pointercancel', onCancel);
  // 注意：不在 pointerdown 時做 setPointerCapture，讓原生捲軸先有機會處理
}

function notesRenderTabs() {
  const row = document.getElementById('notes-tabs-row');
  if (!row) return;
  row.innerHTML = '';
  notesFolderData.forEach((tab, i) => {
    const div = document.createElement('div');
    div.className = 'notes-tab' + (i === notesTabIndex ? ' active' : '');
    div.style.cursor = 'grab';
    div.dataset.tabIdx = i;

    div.addEventListener('pointerdown', e => _notesTabPointerDown(e, div, row));

    div.onclick = e => {
      if (e.target.classList.contains('tab-del-btn')) return;
      if (_tabJustDragged) return; // suppress click after drag
      const idx = parseInt(div.dataset.tabIdx);
      notesFlush();
      notesDropEmptyCurrentPage();
      notesTabIndex = idx;
      _notesMdState.A = true;
      _notesMdState.B = true;
      ['a','b'].forEach(s => {
        const ta = document.getElementById('notesText' + s.toUpperCase());
        const pre = document.getElementById('notes-md-preview-' + s);
        const btn = document.getElementById('notes-md-toggle-' + s);
        if (ta)  ta.style.display = 'none';
        if (pre) pre.classList.add('show');
        if (btn) { btn.classList.add('active'); btn.setAttribute('title','切回編輯模式'); }
      });
      notesRenderTabs();
    };

    div.ondblclick = async e => {
      e.stopPropagation();
      const idx = parseInt(div.dataset.tabIdx);
      const t = notesFolderData[idx];
      const n = await _notesDlg.prompt('修改標籤名稱', t.name);
      if (n?.trim()) { t.name = n.trim(); notesRenderTabs(); notesSave(); }
    };

    const nameSpan = document.createElement('span');
    nameSpan.textContent = tab.name;
    const delSpan = document.createElement('span');
    delSpan.className = 'tab-del-btn';
    delSpan.textContent = '✕';
    delSpan.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(div.dataset.tabIdx);
      notesDeleteTab(idx);
    });
    div.appendChild(nameSpan);
    div.appendChild(delSpan);
    row.appendChild(div);
  });

  // Load current page content
  const tab = notesFolderData[notesTabIndex];
  if (tab) {
    const pg = tab.pages[tab.currentPage] || tab.pages[0];
    if (pg) {
      document.getElementById('notesTitleA').value = pg.titleA || '';
      document.getElementById('notesTextA').value  = pg.a      || '';
      document.getElementById('notesTitleB').value = pg.titleB || '';
      document.getElementById('notesTextB').value  = pg.b      || '';
      notesRefreshPreviews();
    }
    const prevZone = document.getElementById('notes-prev-zone');
    if (prevZone) prevZone.style.visibility = tab.currentPage === 0 ? 'hidden' : 'visible';
    const pnd = document.getElementById('notes-page-num');
    if (pnd) pnd.textContent = (tab.currentPage + 1) + ' / ' + tab.pages.length;
  }
}

// ── Add / Delete tabs ──────────────────────────────────
async function notesPromptAddTab() {
  const name = await _notesDlg.prompt('新標籤名稱', '');
  if (!name?.trim()) return;
  notesFolderData.push({ id: _notesGenId(), name: name.trim(), pages: [{ titleA:'', a:'', titleB:'', b:'' }], currentPage: 0, updatedAt: Date.now() });
  notesTabIndex = notesFolderData.length - 1;
  notesRenderTabs();
  notesSave();
}
window.notesPromptAddTab = notesPromptAddTab;

async function notesDeleteTab(idx) {
  if (notesFolderData.length <= 1) { await _notesDlg.confirm('至少需要保留一個標籤'); return; }
  const confirmed = await _notesDlg.confirm('確定刪除標籤「' + notesFolderData[idx].name + '」嗎？');
  if (!confirmed) return;
  const _deletedTab = notesFolderData[idx];
  if (_deletedTab && _deletedTab.id) {
    window._notesDeletedTabIds = window._notesDeletedTabIds || [];
    window._notesDeletedTabIds.push({ id: _deletedTab.id, deletedAt: Date.now() });
    _notesTrimDeletedLog();
  }
  notesFolderData.splice(idx, 1);
  if (notesTabIndex >= notesFolderData.length) notesTabIndex = notesFolderData.length - 1;
  notesRenderTabs();
  notesSave();
}

// ── Auto-delete empty page on navigation ───────────────
function notesDropEmptyCurrentPage() {
  const tab = notesFolderData[notesTabIndex];
  if (!tab || !tab.pages || tab.pages.length <= 1) return;
  const pg = tab.pages[tab.currentPage];
  if (!pg) return;
  const isEmpty = !(pg.titleA?.trim() || pg.a?.trim() || pg.titleB?.trim() || pg.b?.trim());
  if (isEmpty) {
    tab.pages.splice(tab.currentPage, 1);
    if (tab.currentPage >= tab.pages.length) tab.currentPage = tab.pages.length - 1;
  }
}

// ── Sub-page navigation ────────────────────────────────
function notesChangeSubPage(dir) {
  const tab = notesFolderData[notesTabIndex];
  if (!tab?.pages) return;
  notesFlush();

  const pg = tab.pages[tab.currentPage];
  const isEmpty = pg && !(pg.titleA?.trim() || pg.a?.trim() || pg.titleB?.trim() || pg.b?.trim());

  if (isEmpty && tab.pages.length > 1) {
    const idx = tab.currentPage;
    tab.pages.splice(idx, 1);
    if (dir === -1) {
      tab.currentPage = Math.max(0, idx - 1);
    } else {
      tab.currentPage = Math.min(idx, tab.pages.length - 1);
    }
  } else {
    const newP = tab.currentPage + dir;
    if (newP < 0 || newP >= tab.pages.length) return;
    tab.currentPage = newP;
  }

  notesRenderTabs();
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(notesSave, 800);
}
window.notesChangeSubPage = notesChangeSubPage;

function notesHandleRightZone() {
  const tab = notesFolderData[notesTabIndex];
  if (!tab?.pages) return;
  notesFlush();
  const curr = tab.pages[tab.currentPage];
  const hasContent = curr.titleA?.trim() || curr.a?.trim() || curr.titleB?.trim() || curr.b?.trim();
  if (tab.currentPage === tab.pages.length - 1) {
    if (hasContent) { tab.pages.push({ titleA:'', a:'', titleB:'', b:'' }); notesChangeSubPage(1); }
  } else {
    notesChangeSubPage(1);
  }
}
window.notesHandleRightZone = notesHandleRightZone;

// ── Page number click → title overview popup ─────────
function notesShowTitleOverview(anchorEl) {
  const existing = document.getElementById('notes-title-overview');
  if (existing) { existing.remove(); return; }

  const tab = notesFolderData[notesTabIndex];
  if (!tab) return;

  const popup = document.createElement('div');
  popup.id = 'notes-title-overview';
  popup.style.cssText = `
    position:fixed; z-index:10005;
    background:var(--bg2); border:1px solid var(--border);
    border-radius:12px; padding:8px 0;
    box-shadow:0 8px 28px rgba(58,110,165,0.18);
    min-width:180px; max-width:280px; max-height:320px;
    overflow-y:auto;
    animation: modalIn 0.15s ease;
  `;

  tab.pages.forEach((pg, pi) => {
    const titleA = pg.titleA?.trim();
    const titleB = pg.titleB?.trim();
    const label = titleA && titleB ? `${titleA} / ${titleB}`
                : titleA || titleB || `第 ${pi+1} 頁（無標題）`;
    const isCurrent = pi === tab.currentPage;

    const row = document.createElement('div');
    row.style.cssText = `
      padding:8px 14px; font-size:13px; cursor:pointer;
      color:${isCurrent ? 'var(--green)' : 'var(--text)'};
      background:${isCurrent ? 'rgba(58,110,165,0.07)' : 'transparent'};
      display:flex; align-items:center; gap:8px;
      transition:background 0.15s;
    `;
    row.onmouseover = () => { if (!isCurrent) row.style.background = 'rgba(58,110,165,0.05)'; };
    row.onmouseout  = () => { if (!isCurrent) row.style.background = 'transparent'; };

    const pageNum = document.createElement('span');
    pageNum.style.cssText = 'font-size:10px;color:var(--text-faint);flex-shrink:0;min-width:22px;';
    pageNum.textContent = (pi+1);

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titleSpan.textContent = label;

    if (isCurrent) {
      const dot = document.createElement('span');
      dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background:var(--green);flex-shrink:0;margin-left:auto;';
      row.appendChild(pageNum);
      row.appendChild(titleSpan);
      row.appendChild(dot);
    } else {
      row.appendChild(pageNum);
      row.appendChild(titleSpan);
    }

    row.addEventListener('click', () => {
      notesFlush();
      notesDropEmptyCurrentPage();
      tab.currentPage = pi;
      notesRenderTabs();
      popup.remove();
    });
    popup.appendChild(row);
  });

  document.body.appendChild(popup);

  const rect = anchorEl.getBoundingClientRect();
  const pw = popup.offsetWidth || 200;
  const ph = popup.offsetHeight || 200;
  let left = rect.left + rect.width/2 - pw/2;
  let top  = rect.top - ph - 8;
  if (top < 8) top = rect.bottom + 8;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';

  const closeHandler = e => {
    if (!popup.contains(e.target) && e.target !== anchorEl) {
      popup.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ── Page number long-press context menu ────────────────
let _notesPageCtxTab = null;
function notesShowPageCtx(e) {
  _notesPageCtxTab = notesFolderData[notesTabIndex];
  const menu = document.getElementById('notes-page-ctx');
  if (!menu) return;
  menu.classList.add('show');
  const mw = menu.offsetWidth  || 160;
  const mh = menu.offsetHeight || 120;
  let x = e.clientX ?? 0, y = e.clientY ?? 0;
  if (x + mw > window.innerWidth  - 8) x = window.innerWidth  - mw - 8;
  if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
}

// ── Search ─────────────────────────────────────────────
function notesToggleSearch(force) {
  const bar = document.getElementById('notes-search-bar');
  const btn = document.getElementById('notes-search-btn');
  if (!bar) return;
  const open = force !== undefined ? force : !bar.classList.contains('open');
  bar.classList.toggle('open', open);
  btn?.classList.toggle('active', open);
  if (open) {
    const inp = document.getElementById('notes-search-input');
    if (inp) { inp.value = ''; inp.focus(); }
  } else {
    const res = document.getElementById('notes-search-results');
    if (res) res.classList.remove('show');
  }
}
window.notesToggleSearch = notesToggleSearch;

function notesRunSearch(q) {
  const res = document.getElementById('notes-search-results');
  if (!res) return;
  res.innerHTML = '';
  const query = (q || '').trim().toLowerCase();
  if (!query) { res.classList.remove('show'); return; }

  const hits = [];
  notesFolderData.forEach((tab, ti) => {
    tab.pages.forEach((pg, pi) => {
      const titleA = (pg.titleA || '').toLowerCase();
      const textA  = (pg.a      || '').toLowerCase();
      const titleB = (pg.titleB || '').toLowerCase();
      const textB  = (pg.b      || '').toLowerCase();
      if (titleA.includes(query) || textA.includes(query) || titleB.includes(query) || textB.includes(query)) {
        const snippet = [pg.a, pg.b].filter(Boolean).join(' ').replace(/\n/g,' ').slice(0, 80);
        hits.push({ ti, pi, tab: tab.name, titleA: pg.titleA, titleB: pg.titleB, snippet });
      }
    });
  });

  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'notes-search-empty';
    empty.textContent = '找不到相關筆記';
    res.appendChild(empty);
  } else {
    hits.forEach(h => {
      const item = document.createElement('div');
      item.className = 'notes-search-item';
      const label = [h.titleA, h.titleB].filter(Boolean).join(' / ') || '（無標題）';
      // 用 textContent 逐一設定，避免 innerHTML XSS
      const titleSpan = document.createElement('span');
      titleSpan.className = 'notes-search-title';
      titleSpan.textContent = label;
      const metaSpan = document.createElement('span');
      metaSpan.className = 'notes-search-meta';
      metaSpan.textContent = h.tab + ' · 第 ' + (h.pi + 1) + ' 頁';
      const snippetSpan = document.createElement('span');
      snippetSpan.className = 'notes-search-snippet';
      snippetSpan.textContent = h.snippet;
      item.appendChild(titleSpan);
      item.appendChild(metaSpan);
      item.appendChild(snippetSpan);
      item.addEventListener('click', () => {
        notesFlush();
        notesTabIndex = h.ti;
        notesFolderData[h.ti].currentPage = h.pi;
        notesRenderTabs();
        notesToggleSearch(false);
      });
      res.appendChild(item);
    });
  }
  res.classList.add('show');
}
window.notesRunSearch = notesRunSearch;

// ── MD Toolbar ─────────────────────────────────────────
function notesInitToolbar() {
  const toolbar = document.getElementById('notes-md-toolbar');
  if (!toolbar) return;
  let _activeTA = null;

  function hideToolbar() { toolbar.classList.remove('show'); }

  function wrapSel(before, after) {
    const ta = _activeTA; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e);
    ta.value = ta.value.slice(0,s) + before + sel + after + ta.value.slice(e);
    ta.selectionStart = s + before.length;
    ta.selectionEnd   = s + before.length + sel.length;
    ta.focus(); ta.dispatchEvent(new Event('input',{bubbles:true}));
    if (!isTouchDevice()) hideToolbar();
  }
  function prefixLine(pfx) {
    const ta = _activeTA; if (!ta) return;
    const s = ta.selectionStart;
    let ls = s; while (ls > 0 && ta.value[ls-1] !== '\n') ls--;
    ta.value = ta.value.slice(0, ls) + pfx + ta.value.slice(ls);
    ta.selectionStart = ta.selectionEnd = s + pfx.length;
    ta.focus(); ta.dispatchEvent(new Event('input',{bubbles:true}));
    if (!isTouchDevice()) hideToolbar();
  }

  function bind(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
    el.addEventListener('touchend',  e => { e.preventDefault(); fn(); });
  }
  bind('ntb-h3',   () => prefixLine('### '));
  bind('ntb-h4',   () => prefixLine('#### '));
  bind('ntb-bold', () => wrapSel('**','**'));
  bind('ntb-underline', () => wrapSel('<u>','</u>'));
  bind('ntb-box',  () => wrapSel('<span style="border:1px solid currentColor;border-radius:3px;padding:0 4px;">','</span>'));
  bind('ntb-ul',   () => prefixLine('- '));
  bind('ntb-ol',   () => prefixLine('1. '));
  bind('ntb-hr',   () => {
    const ta=_activeTA; if(!ta) return;
    const s=ta.selectionStart;
    ta.value=ta.value.slice(0,s)+'\n---\n'+ta.value.slice(s);
    ta.selectionStart=ta.selectionEnd=s+5;
    ta.focus(); ta.dispatchEvent(new Event('input',{bubbles:true}));
    if (!isTouchDevice()) hideToolbar();
  });

  toolbar.querySelectorAll('.ntb-color-dot').forEach(dot => {
    const fn = e => { e.preventDefault(); wrapSel('<span style="color:'+dot.dataset.color+'">','</span>'); };
    dot.addEventListener('mousedown', fn); dot.addEventListener('touchend', fn);
  });
  toolbar.querySelectorAll('.ntb-hl-dot').forEach(dot => {
    const fn = e => { e.preventDefault(); wrapSel('<mark style="background:'+dot.dataset.hl+';padding:0 2px;border-radius:2px;">','</mark>'); };
    dot.addEventListener('mousedown', fn); dot.addEventListener('touchend', fn);
  });

  const isTouchDevice = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function setActiveTA(ta) { _activeTA = ta; }

  function showToolbar(mouseX, mouseY) {
    if (isTouchDevice()) return;
    if (!_activeTA) return;
    toolbar.style.left = '';
    toolbar.style.top  = '';
    toolbar.classList.add('show');
    const tw = toolbar.offsetWidth  || 320;
    const th = toolbar.offsetHeight || 40;
    const r  = _activeTA.getBoundingClientRect();
    const cx = (mouseX !== undefined) ? mouseX : r.left + r.width / 2;
    const cy = (mouseY !== undefined) ? mouseY : r.top;
    let lx = cx - tw / 2;
    let ty = cy - th - 10;
    if (lx < 8) lx = 8;
    if (lx + tw > window.innerWidth - 8) lx = window.innerWidth - tw - 8;
    if (ty < 8) ty = cy + 14;
    if (ty + th > window.innerHeight - 8) ty = window.innerHeight - th - 8;
    toolbar.style.left = lx + 'px';
    toolbar.style.top  = ty + 'px';
  }

  ['notesTextA','notesTextB'].forEach(id => {
    const ta = document.getElementById(id);
    if (!ta) return;
    ta.addEventListener('focus', () => {
      setActiveTA(ta);
      // 不在 focus 時顯示工具列，等使用者選取文字再顯示
    });
    ta.addEventListener('blur', () => {
      setTimeout(() => {
        if (!toolbar.contains(document.activeElement) &&
            !['notesTextA','notesTextB','notesTitleA','notesTitleB'].includes(document.activeElement?.id)) {
          hideToolbar();
        }
      }, 150);
    });
  });

  document.addEventListener('mouseup', e => {
    if (isTouchDevice()) return;
    if (e.target.classList.contains('notes-textarea')) {
      setActiveTA(e.target);
      // 只在有選取文字時才顯示工具列
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (e.target.style.display !== 'none' && hasSelection) showToolbar(e.clientX, e.clientY);
      else if (!hasSelection) hideToolbar();
    } else if (!toolbar.contains(e.target)) {
      hideToolbar();
    }
  });

  document.addEventListener('contextmenu', e => {
    if (!e.target.classList.contains('notes-textarea')) return;
    e.preventDefault();
    setActiveTA(e.target);
    showToolbar(e.clientX, e.clientY);
  });
}

// ── Page context menu wiring ───────────────────────────
function notesWirePageCtx() {
  const pnd = document.getElementById('notes-page-num');
  if (!pnd) return;

  pnd.addEventListener('click', e => {
    e.stopPropagation();
    notesShowTitleOverview(pnd);
  });

  let _lpTimer = null;
  pnd.addEventListener('touchstart', e => {
    clearTimeout(_lpTimer);
    const t = e.touches[0];
    _lpTimer = setTimeout(() => {
      notesShowPageCtx({ clientX: t.clientX, clientY: t.clientY });
    }, 500);
  }, { passive: true });
  pnd.addEventListener('touchend',  () => clearTimeout(_lpTimer), { passive: true });
  pnd.addEventListener('touchmove', () => clearTimeout(_lpTimer), { passive: true });
  pnd.addEventListener('contextmenu', e => { e.preventDefault(); notesShowPageCtx(e); });

  document.getElementById('notes-ctx-after')?.addEventListener('click', async () => {
    const tab = _notesPageCtxTab || notesFolderData[notesTabIndex];
    notesFlush();
    const idx = tab.currentPage;
    tab.pages.splice(idx+1, 0, { titleA:'', a:'', titleB:'', b:'' });
    tab.currentPage = idx+1;
    notesRenderTabs(); notesSave();
    document.getElementById('notes-page-ctx').classList.remove('show');
  });
  document.getElementById('notes-ctx-before')?.addEventListener('click', async () => {
    const tab = _notesPageCtxTab || notesFolderData[notesTabIndex];
    notesFlush();
    const idx = tab.currentPage;
    tab.pages.splice(idx, 0, { titleA:'', a:'', titleB:'', b:'' });
    notesRenderTabs(); notesSave();
    document.getElementById('notes-page-ctx').classList.remove('show');
  });
  document.getElementById('notes-ctx-move')?.addEventListener('click', async () => {
    const tab = _notesPageCtxTab || notesFolderData[notesTabIndex];
    document.getElementById('notes-page-ctx').classList.remove('show');
    const total = tab.pages.length;
    if (total <= 1) { await _notesDlg.confirm('目前只有一頁，無法移動'); return; }
    const current = tab.currentPage + 1;
    const input = await _notesDlg.prompt(
      '目前第 ' + current + ' 頁，共 ' + total + ' 頁\n請輸入要移到第幾頁（1–' + total + '）：', ''
    );
    if (!input?.trim()) return;
    const target = parseInt(input.trim());
    if (isNaN(target) || target < 1 || target > total) {
      await _notesDlg.confirm('請輸入有效頁碼（1–' + total + '）');
      return;
    }
    const toIdx = target - 1;
    if (toIdx === tab.currentPage) return;
    notesFlush();
    const [moved] = tab.pages.splice(tab.currentPage, 1);
    tab.pages.splice(toIdx, 0, moved);
    tab.currentPage = toIdx;
    notesRenderTabs(); notesSave();
  });
  document.getElementById('notes-ctx-del')?.addEventListener('click', async () => {
    const tab = _notesPageCtxTab || notesFolderData[notesTabIndex];
    if (tab.pages.length <= 1) { document.getElementById('notes-page-ctx').classList.remove('show'); return; }
    const ok = await _notesDlg.confirm('確定刪除此頁？');
    if (!ok) return;
    const idx = tab.currentPage;
    tab.pages.splice(idx, 1);
    tab.currentPage = Math.min(idx, tab.pages.length-1);
    notesRenderTabs(); notesSave();
    document.getElementById('notes-page-ctx').classList.remove('show');
  });

  document.addEventListener('click', e => {
    const ctx = document.getElementById('notes-page-ctx');
    if (ctx && !ctx.contains(e.target) && e.target !== pnd) ctx.classList.remove('show');
  });
}

// ── Show / Hide notes page ─────────────────────────────
function notesShow() {
  _notesIsVisible = true;
  if (!_notesLoaded || notesFolderData.length === 0) {
    notesLoad();
  }
  notesEnsureDefaults();
  // ★ 恢復到上次停留的 tab 和 page（直接由 notesLoad/notesLoadFromData 寫入 notesTabIndex 和 currentPage）
  if (notesFolderData.length > 0) {
    notesTabIndex = Math.min(notesTabIndex, notesFolderData.length - 1);
    const tab = notesFolderData[notesTabIndex];
    if (tab) tab.currentPage = Math.min(tab.currentPage ?? 0, tab.pages.length - 1);
  }
  notesRenderTabs();
  // Show the import/export button in the header
  const ioBtn = document.getElementById('notes-io-btn');
  if (ioBtn) ioBtn.style.display = 'inline-flex';
}

function notesHide() {
  notesFlush();
  // ★ 離開時直接 save，notesSave() 會把當下 notesTabIndex 和 currentPage 存入
  clearTimeout(notesSaveTimer);
  notesSave();
  _notesIsVisible = false;
  // Hide the import/export button
  const ioBtn = document.getElementById('notes-io-btn');
  if (ioBtn) ioBtn.style.display = 'none';
  _notesCloseIoMenu();
}

// ── Override showPage to handle notes ─────────────────
const _origShowPage = showPage;
showPage = function(id, skipRender) {
  if (_notesIsVisible && id !== 'notes') notesHide();
  document.getElementById('page-notes').classList.toggle('active', id === 'notes');
  if (id === 'notes') {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id !== 'page-notes') {
      window._notesPrevPage = activePage.id.replace('page-', '');
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.mob-nav-item').forEach(n => n.classList.remove('active'));
    const sn = document.getElementById('nav-notes');
    const mn = document.getElementById('mob-notes');
    if (sn) sn.classList.add('active');
    if (mn) mn.classList.add('active');
    notesShow();
    return;
  }
  _origShowPage(id, skipRender);
};

// ── Logo: 長按 → 設定選單，單擊 → notes 導航 ─────
function notesRewireLogo() {
  const logo = document.getElementById('logoBtn');
  if (!logo) return;

  const newLogo = logo.cloneNode(true);
  logo.parentNode.replaceChild(newLogo, logo);

  function _goHome() {
    if (typeof _notesIsVisible !== 'undefined' && _notesIsVisible) {
      showPage(window._notesPrevPage || 'tree');
    } else {
      showPage('tree');
    }
  }

  function _openSettings() {
    if (navigator.vibrate) navigator.vibrate(30);
    openApiModal();
  }

  let _lp = null, _lpFired = false;
  newLogo.addEventListener('mousedown', () => {
    _lpFired = false;
    _lp = setTimeout(() => { _lpFired = true; _openSettings(); }, 500);
  });
  newLogo.addEventListener('mouseup',    () => clearTimeout(_lp));
  newLogo.addEventListener('mouseleave', () => clearTimeout(_lp));
  newLogo.addEventListener('click', e => {
    e.stopPropagation();
    if (_lpFired) { _lpFired = false; return; }
    _goHome();
  });

  let _touchLp = null, _touchFired = false, _tx = 0, _ty = 0;
  newLogo.addEventListener('touchstart', e => {
    _touchFired = false;
    _tx = e.touches[0].clientX; _ty = e.touches[0].clientY;
    _touchLp = setTimeout(() => { _touchFired = true; _openSettings(); }, 500);
  }, { passive: true });
  newLogo.addEventListener('touchmove', e => {
    if (Math.abs(e.touches[0].clientX - _tx) > 8 || Math.abs(e.touches[0].clientY - _ty) > 8) clearTimeout(_touchLp);
  }, { passive: true });
  newLogo.addEventListener('touchend', e => {
    clearTimeout(_touchLp);
    e.preventDefault(); e.stopPropagation();
    if (_touchFired) { _touchFired = false; return; }
    _goHome();
  });
}
// ── Swipe left/right on notes page tabs (title inputs only) ───────────
function notesInitSwipe() {
  // Only title inputs support swipe-to-change-page (textareas use native scroll)
  const titles = [document.getElementById('notesTitleA'), document.getElementById('notesTitleB')];
  titles.forEach(el => {
    if (!el) return;
    el.addEventListener('touchstart', e => {
      el._startX = e.touches[0].clientX;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      const deltaX = e.changedTouches[0].clientX - (el._startX || 0);
      if (Math.abs(deltaX) > 60) {
        notesChangeSubPage(deltaX > 0 ? -1 : 1);
      }
    }, { passive: true });
  });
}

// ── Arrow-key page navigation ──────────────────────────
function notesInitKeys() {
  document.addEventListener('keydown', e => {
    if (!_notesIsVisible) return;
    if (e.key === 'Escape') {
      const bar = document.getElementById('notes-search-bar');
      if (bar && bar.classList.contains('open')) { notesToggleSearch(false); return; }
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains('notes-textarea')) {
      e.preventDefault();
      notesChangeSubPage(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
}

// No-op (kept for any external callers)
function notesSizeMobile() {}
window.notesSizeMobile = notesSizeMobile;

// ── Import / Export ────────────────────────────────────
let _ioMenu = null;

function notesShowIoMenu() {
  if (_ioMenu) { _ioMenu.remove(); _ioMenu = null; return; }
  const btn = document.getElementById('notes-io-btn');
  const rect = btn ? btn.getBoundingClientRect() : { left: 60, bottom: 56, right: 160 };

  const menu = document.createElement('div');
  menu.id = 'notes-io-menu';
  menu.style.cssText = `
    position:fixed;z-index:10010;
    background:var(--bg2);border:1px solid var(--border);
    border-radius:12px;padding:6px 0;
    box-shadow:0 8px 28px rgba(58,110,165,0.18);
    min-width:180px;animation:modalIn 0.15s ease;
  `;
  const items = [
    { label: '📤 匯出為 .txt', fn: 'notesExportTxt()' },
    { label: '📤 匯出為 .md',  fn: 'notesExportMd()' },
    { label: '📤 匯出為 JSON', fn: 'notesExportJson()' },
    { sep: true },
    { label: '📥 從 JSON 匯入', fn: 'notesImportJson()' },
    { sep: true },
    { label: '☁ 強制同步至雲端', fn: 'forceSyncNotesFromMenu()' },
  ];
  menu.innerHTML = items.map(it => {
    if (it.sep) return `<div style="height:1px;background:var(--border);margin:4px 8px"></div>`;
    return `<div onclick="${it.fn};_notesCloseIoMenu()" class="logo-menu-item" style="font-size:13px">${it.label}</div>`;
  }).join('');

  document.body.appendChild(menu);
  _ioMenu = menu;

  // Position below the button
  const mw = 190;
  let left = rect.left;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  menu.style.left = left + 'px';
  menu.style.top  = (rect.bottom + 6) + 'px';

  setTimeout(() => document.addEventListener('click', _notesIoOutside), 0);
}

function _notesCloseIoMenu() {
  if (_ioMenu) { _ioMenu.remove(); _ioMenu = null; }
  document.removeEventListener('click', _notesIoOutside);
}

function _notesIoOutside(e) {
  if (_ioMenu && !_ioMenu.contains(e.target) && e.target.id !== 'notes-io-btn') {
    _notesCloseIoMenu();
  }
}
window.notesShowIoMenu = notesShowIoMenu;
window._notesCloseIoMenu = _notesCloseIoMenu;

async function forceSyncNotesFromMenu() {
  await forceSyncNotes();
}
window.forceSyncNotesFromMenu = forceSyncNotesFromMenu;

function copyDeviceUidFromSettings() {
  const uid = window._fbAuthUid || window._fbUid || '';
  const statusEl = document.getElementById('settingsDeviceIdStatus');
  if (!uid) { if (statusEl) { statusEl.style.color = 'var(--rose)'; statusEl.textContent = '尚未取得'; } return; }
  navigator.clipboard.writeText(uid).then(() => {
    if (statusEl) { statusEl.style.color = 'var(--green)'; statusEl.textContent = '✓ 已複製'; setTimeout(() => { statusEl.textContent = ''; }, 3000); }
  }).catch(() => {
    if (statusEl) { statusEl.style.color = 'var(--text-dim)'; statusEl.textContent = uid.slice(0,8) + '…'; }
  });
}
window.copyDeviceUidFromSettings = copyDeviceUidFromSettings;

function notesExportTxt() {
  notesFlush();
  const lines = [];
  notesFolderData.forEach(tab => {
    lines.push(`===== ${tab.name} =====`);
    tab.pages.forEach((pg, i) => {
      lines.push(`--- 第 ${i+1} 頁 ---`);
      if (pg.titleA) lines.push(`[A] ${pg.titleA}`);
      if (pg.a)      lines.push(pg.a);
      if (pg.titleB) lines.push(`[B] ${pg.titleB}`);
      if (pg.b)      lines.push(pg.b);
    });
    lines.push('');
  });
  _notesDownload('aethelgard_notes.txt', lines.join('\n'), 'text/plain');
}
window.notesExportTxt = notesExportTxt;

function notesExportMd() {
  notesFlush();
  const lines = [];
  notesFolderData.forEach(tab => {
    lines.push(`# ${tab.name}`);
    tab.pages.forEach((pg, i) => {
      lines.push(`## 第 ${i+1} 頁`);
      if (pg.titleA) lines.push(`### ${pg.titleA}`);
      if (pg.a)      lines.push(pg.a);
      if (pg.titleB) lines.push('\n---\n### ' + pg.titleB);
      if (pg.b)      lines.push(pg.b);
    });
    lines.push('');
  });
  _notesDownload('aethelgard_notes.md', lines.join('\n'), 'text/markdown');
}
window.notesExportMd = notesExportMd;

function notesExportJson() {
  notesFlush();
  const data = JSON.stringify({ tabs: notesFolderData, exportedAt: new Date().toISOString() }, null, 2);
  _notesDownload('aethelgard_notes.json', data, 'application/json');
}
window.notesExportJson = notesExportJson;

function notesImportJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Support multiple JSON formats:
      // 1. Our export format:          { tabs: [...], exportedAt: ... }
      // 2. localStorage raw format:    { tabs: [...], lastTab: 0, updatedAt: ... }
      // 3. Cloud full-backup format:   { tasks: [...], notes: { tabs: [...] }, ... }
      // 4. Direct tabs array:          [{ name, pages, ... }]
      let tabs = null;
      if (Array.isArray(data)) {
        tabs = data; // raw array of tabs
      } else if (data.tabs && Array.isArray(data.tabs)) {
        tabs = data.tabs; // our export / localStorage format
      } else if (data.notes && data.notes.tabs && Array.isArray(data.notes.tabs)) {
        tabs = data.notes.tabs; // cloud full-backup format
      }

      if (!tabs) {
        alert('格式錯誤：無法辨識此 JSON 的筆記結構。\n\n支援格式：\n・從本程式匯出的 .json\n・localStorage 備份\n・雲端完整備份（含 notes.tabs 欄位）');
        return;
      }

      const ok = await _notesDlg.confirm('確定匯入「' + file.name + '」？這會覆蓋目前所有標籤頁的內容。');
      if (!ok) return;
      notesFlush();
      notesFolderData = tabs;
      notesTabIndex = 0;
      notesEnsureDefaults();
      notesSave();
      notesRenderTabs();
      if (typeof showToast === 'function') showToast('📥 筆記已匯入（共 ' + tabs.length + ' 個標籤）');
    } catch(err) {
      alert('匯入失敗：' + err.message);
    }
  };
  input.click();
}
window.notesImportJson = notesImportJson;

function _notesDownload(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  notesInitToolbar();
  notesWirePageCtx();
  notesInitSwipe();
  notesInitKeys();
  document.addEventListener('click', e => {
    const bar = document.getElementById('notes-search-bar');
    const res = document.getElementById('notes-search-results');
    if (res && !bar?.contains(e.target)) res.classList.remove('show');
  });
  // 筆記預覽區連結另開視窗（document-level，PWA 動態內容也適用）
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (!a.closest('[id^="notes-md-preview"]')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  });
});

window.addEventListener('load', () => {
  setTimeout(notesRewireLogo, 200);
});

// 頁面隱藏（切分頁、關閉）時，若有待推的筆記變更，立刻觸發同步
// 頁面重新顯示時，若離開夠久，直接整頁重新整理（解決多裝置不自動更新問題）
// ★ Bug fix：原本這裡多判斷了一個 getApiUrl()，但 Firebase 模式下 getApiUrl()
//   固定回傳空字串（舊版 API URL 模式的殘留邏輯，Firebase 模式用不到），
//   導致這整段「回到前景就重新拉雲端資料」的保護從來沒有執行過。
//   後果：手機切到背景一段時間（連線可能已斷開/被瀏覽器凍結）期間，
//   若其他裝置修改並推送了新資料，手機回到前景後仍然抱著舊的 state，
//   只要之後在手機上有任何操作觸發同步，就會用這份舊資料把其他裝置的新資料蓋掉。
// ★ 這裡選擇「整頁重整」而不是在原地手動更新 state：
//   手動更新需要自己想清楚每一個變數、每一個 UI 元件要不要重設，很容易漏掉；
//   整頁重整則是直接重跑一次完整、已經測過的 init() 流程，結果一定是乾淨、正確的，
//   代價只是重新整理那一兩秒的畫面閃爍，換來的可靠度划算很多。
let _lastHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _lastHiddenAt = Date.now();
    // 隱藏：推送待同步的筆記變更
    if (_notesSyncTimer !== null) {
      clearTimeout(_notesSyncTimer);
      _notesSyncTimer = null;
    }
    if (typeof syncToCloud === 'function') syncToCloud();
  } else if (document.visibilityState === 'visible' && state._initDone) {
    // 只有「離開超過一段時間」才重整，避免每次短暫切分頁/切 App 都閃一下畫面。
    // 15 秒是「快速切出去看一下又回來」跟「真的放到背景一陣子」的分界，可依實際使用調整。
    const _hiddenDuration = _lastHiddenAt ? Date.now() - _lastHiddenAt : 0;
    if (_hiddenDuration < 15000) return;
    // ★ 僅 Owner 登入時：重整前先記住目前停留的畫面（筆記頁另外記標籤/頁碼），
    //   重整後由 tasks.js 的 init() 結尾讀回並還原，避免每次都被丟回生命樹頁。
    //   訪客模式不做這件事，維持原本固定回到生命樹頁的行為。
    if (window._fbIsOwner === true) {
      try {
        // ★ fix：page-notes 這個容器沒有 .page class，querySelector('.page.active')
        //   永遠抓不到它，且切進筆記頁時前一頁的 .active 不會被移除，
        //   會誤把「切進筆記頁之前那一頁」當成目前頁面。改用 _notesIsVisible 直接判斷。
        let _pageId;
        if (_notesIsVisible) {
          _pageId = 'notes';
        } else {
          const _activePage = document.querySelector('.page.active');
          _pageId = _activePage ? _activePage.id.replace(/^page-/, '') : null;
        }
        if (_pageId) {
          const _restoreData = { page: _pageId };
          if (_pageId === 'notes' && Array.isArray(notesFolderData) && notesFolderData[notesTabIndex]) {
            _restoreData.notesTab = notesTabIndex;
            _restoreData.notesPage = notesFolderData[notesTabIndex].currentPage ?? 0;
          }
          sessionStorage.setItem('aethelgard_reload_restore', JSON.stringify(_restoreData));
        }
      } catch(e) {}
    }
    location.reload();
  }
});
