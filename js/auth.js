// ── Firebase 就緒回呼（由 module script 呼叫）──
let _firebaseReadyFired = false;
window._onFirebaseReady = async function() {
  const btn = document.getElementById('settingsBtn');
  if (btn) { btn.classList.add('connected'); btn.textContent = '☁ Connected'; }

  const authUid = window._fbAuthUid || '';

  // ── 情況 1：Owner（email 登入，非訪客 session）──
  if (window._fbIsOwner && authUid && !window._fbGuestSessionActive) {
    window._fbUid = authUid;
    try { localStorage.setItem('aethelgard_fb_uid', authUid); } catch(e) {}
    try { localStorage.setItem('aethelgard_fb_owner_uid', authUid); } catch(e) {}
    if (typeof _lastSyncHash !== 'undefined') _lastSyncHash = '';
    // ★ Fix：Owner 自動免登入時，立即把鎖屏換成「載入中」畫面，
    //   避免在 loadFromCloud() 完成前，OTP 輸入格一閃而過。
    const _card = document.getElementById('ownerLoginCard');
    if (_card && document.getElementById('guestTokenSection')) {
      _card.innerHTML = '<div style="font-size:40px;margin-bottom:16px">🔐</div>'
        + '<div style="font-family:\'DM Serif Display\',serif;font-size:20px;color:var(--green);margin-bottom:8px">Aethelgard</div>'
        + '<div style="font-size:13px;color:var(--text-dim);letter-spacing:0.04em">正在載入資料…</div>';
    }
    _firebaseReadyFired = true;
    if (typeof window._onFirebaseReadyCallback === 'function') {
      window._onFirebaseReadyCallback();
    } else {
      // ★ Race condition fix：init() 還沒跑到設定 callback 的地方（module 非同步載入比 init 早觸發）
      // 記下 pending 狀態，等 init() 設好 callback 後會立刻補呼叫
      window._firebaseReadyPending = true;
    }
    return;
  }

  // ── 情況 2：訪客 session 登入成功（_fbGuestSessionActive 已由 submitGuestToken 設好）──
  if (window._fbGuestSessionActive && window._fbUid) {
    if (typeof _lastSyncHash !== 'undefined') _lastSyncHash = '';
    _firebaseReadyFired = true;
    if (typeof window._onFirebaseReadyCallback === 'function') {
      window._onFirebaseReadyCallback();
    } else {
      window._firebaseReadyPending = true;
    }
    return;
  }

  // ── 情況 3：未登入 → 確保鎖屏顯示（已預設 display:flex，這裡只做補強）──
  openOwnerLoginOverlay();
};

// ── 切換 Owner 登入區域展開/收合 ──
function toggleOwnerLoginSection() {
  const section = document.getElementById('ownerLoginSection');
  const arrow = document.getElementById('ownerLoginToggleArrow');
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
  if (!isOpen) {
    // 展開時自動填入儲存的信箱
    setTimeout(() => {
      const savedEmail = localStorage.getItem('aethelgard_owner_email') || '';
      const emailInput = document.getElementById('ownerEmailInput');
      const pwInput = document.getElementById('ownerPasswordInput');
      if (emailInput && savedEmail && !emailInput.value) {
        emailInput.value = savedEmail;
        if (pwInput) pwInput.focus();
      } else if (emailInput) {
        emailInput.focus();
      }
    }, 50);
  }
}
window.toggleOwnerLoginSection = toggleOwnerLoginSection;

// ── Owner 登入框（鎖屏為主畫面，已預設顯示）──
function openOwnerLoginOverlay() {
  const el = document.getElementById('ownerLoginOverlay');
  if (!el) return;
  // 還原回通行碼輸入畫面（不是載入提示）
  const card = document.getElementById('ownerLoginCard');
  if (card) {
    // 如果已被替換成載入中畫面，恢復原本內容
    if (!document.getElementById('guestTokenSection')) {
      card.innerHTML = `
        <div style="font-size:32px;margin-bottom:8px">🔑</div>
        <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--green);margin-bottom:4px">Aethelgard</div>
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:24px;letter-spacing:0.04em">輸入通行碼以進入</div>
        <div id="guestTokenSection">
          <div class="lock-input-group">
            <span class="lock-input-label">通行碼</span>
            <div class="otp-grid" id="otpGrid">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="0">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="1">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="2">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="3">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="4">
              <input class="otp-cell-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" dir="ltr" data-idx="5">
            </div>
            <input id="guestTokenInput" type="hidden">
          </div>
          <div id="guestTokenError" style="font-size:11px;color:var(--rose,#e05);min-height:16px;margin-bottom:10px;text-align:center"></div>
          <button class="lock-submit-btn" onclick="submitGuestToken()">進入 →</button>
        </div>
        <div>
          <button onclick="toggleOwnerLoginSection()"
            id="ownerLoginToggleBtn"
            style="width:100%;padding:8px;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--text-faint);font-size:12px;cursor:pointer;font-family:inherit;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px"
            onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'"
            onmouseout="this.style.borderColor='';this.style.color=''">
            <span>🔐</span><span>Owner 登入</span><span id="ownerLoginToggleArrow" style="font-size:10px;transition:transform 0.2s">▼</span>
          </button>
          <div id="ownerLoginSection" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <input id="ownerEmailInput" type="email" placeholder="Owner 信箱"
              style="width:100%;box-sizing:border-box;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;color:var(--text);font-size:14px;outline:none;font-family:inherit;margin-bottom:10px;transition:border-color 0.2s"
              onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor=''"
              onkeydown="if(event.key==='Enter')document.getElementById('ownerPasswordInput').focus()">
            <input id="ownerPasswordInput" type="password" placeholder="密碼"
              style="width:100%;box-sizing:border-box;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;color:var(--text);font-size:14px;outline:none;font-family:inherit;margin-bottom:10px;transition:border-color 0.2s"
              onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor=''"
              onkeydown="if(event.key==='Enter')submitOwnerLogin()">
            <div id="ownerLoginError" style="font-size:11px;color:var(--rose);min-height:16px;margin-bottom:10px"></div>
            <button onclick="submitOwnerLogin()"
              style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--green);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s"
              onmouseover="this.style.opacity='0.87'" onmouseout="this.style.opacity='1'">登入 Owner →</button>
          </div>
        </div>`;
      // 動態重建後重新初始化 OTP
      setTimeout(() => { if (typeof window._initOtpFn === 'function') window._initOtpFn(); }, 0);
    }
  }
  el.style.display = 'flex';
  // 重新顯示鎖屏時，確保主介面不可見
  document.body.classList.remove('auth-ready');
  // focus 通行碼輸入
  setTimeout(() => {
    if (typeof window._otpReset === 'function') window._otpReset();
    else {
      const tokenInput = document.getElementById('guestTokenInput');
      if (tokenInput) tokenInput.focus();
    }
  }, 100);
}
window.openOwnerLoginOverlay = openOwnerLoginOverlay;

function closeOwnerLoginOverlay() {
  // 守門：只有通過驗證才能關閉鎖屏
  const isOwner = window._fbIsOwner === true;
  const isGuest = window._fbGuestSessionActive === true && !!window._fbUid;
  if (!isOwner && !isGuest) {
    console.warn('[overlay] 嘗試關閉鎖屏但未通過驗證，攔截。');
    return;
  }
  const el = document.getElementById('ownerLoginOverlay');
  if (!el) return;
  el.classList.add('hiding');
  setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('hiding');
    // 驗證完成，顯示主介面
    document.body.classList.add('auth-ready');
  }, 350);
}
window.closeOwnerLoginOverlay = closeOwnerLoginOverlay;

async function submitOwnerLogin() {
  const email = (document.getElementById('ownerEmailInput').value || '').trim();
  const password = (document.getElementById('ownerPasswordInput').value || '');
  const errEl = document.getElementById('ownerLoginError');
  if (!email || !password) { errEl.textContent = '請輸入信箱與密碼'; return; }
  errEl.textContent = '登入中…'; errEl.style.color = '';
  try {
    const cred = await window._fbOwnerLogin(email, password);
    window._fbAuthUid = cred.user.uid;
    window._fbIsOwner = true;
    window._fbGuestSessionActive = false;
    window._fbUid = cred.user.uid;
    try { localStorage.setItem('aethelgard_fb_uid', cred.user.uid); } catch(e2) {}
    try { localStorage.setItem('aethelgard_fb_owner_uid', cred.user.uid); } catch(e2) {}
    // 信任裝置：儲存 email 到 localStorage（下次自動填入）
    try { localStorage.setItem('aethelgard_owner_email', email); } catch(e2) {}
    // 切換鎖屏為載入狀態（登入成功後資料同步前不讓使用者看到背後介面）
    const _card = document.getElementById('ownerLoginCard');
    if (_card) {
      _card.innerHTML = '<div style="font-size:40px;margin-bottom:16px">🔐</div>'
        + '<div style="font-family:\'DM Serif Display\',serif;font-size:20px;color:var(--green);margin-bottom:8px">Aethelgard</div>'
        + '<div style="font-size:13px;color:var(--text-dim);letter-spacing:0.04em">Owner 已登入，正在載入資料…</div>';
    }
    if (typeof _lastSyncHash !== 'undefined') _lastSyncHash = '';
    // 重新觸發 ready 流程（init 完成後會呼叫 closeOwnerLoginOverlay）
    _firebaseReadyFired = false;
    if (typeof window._onFirebaseReady === 'function') window._onFirebaseReady();
    if (typeof window._onFirebaseReadyCallback === 'function') window._onFirebaseReadyCallback();
  } catch(e) {
    const codeMap = {
      'auth/invalid-credential': '信箱或密碼錯誤',
      'auth/user-not-found': '找不到此帳號',
      'auth/wrong-password': '密碼錯誤',
      'auth/invalid-email': '信箱格式不正確',
      'auth/too-many-requests': '嘗試次數過多，請稍後再試',
    };
    errEl.textContent = codeMap[e.code] || ('登入失敗：' + e.message);
    errEl.style.color = 'var(--rose)';
  }
}
window.submitOwnerLogin = submitOwnerLogin;

// ── Owner 登出 ──
async function ownerSignOut() {
  try {
    await window._fbOwnerSignOut();
    localStorage.removeItem('aethelgard_fb_uid');
    localStorage.removeItem('aethelgard_fb_owner_uid');
    window._fbUid = '';
    window._fbAuthUid = '';
    window._fbIsOwner = false;
    window._fbGuestSessionActive = false;
    // 登出後隱藏 syncDot，回到鎖屏
    const dot = document.getElementById('syncDot');
    if (dot) dot.style.display = 'none';
    showToast('🔓 已登出');
    openOwnerLoginOverlay();
    // 清空通行碼輸入
    setTimeout(() => {
      if (typeof window._otpReset === 'function') window._otpReset();
      else {
        const ti = document.getElementById('guestTokenInput');
        if (ti) { ti.value = ''; ti.focus(); }
      }
      const err = document.getElementById('guestTokenError');
      if (err) { err.textContent = ''; }
    }, 100);
  } catch(e) {
    showToast('登出失敗：' + e.message);
  }
}
window.ownerSignOut = ownerSignOut;

// ── 強制登出所有訪客（Owner 專屬）──
async function revokeAllGuests() {
  if (window._fbGuestSessionActive) { showToast('❌ 只有 Owner 才能執行此操作'); return; }
  const ok = await window._fbRevokeAllGuests();
  if (ok) {
    showToast('🔒 已強制登出所有訪客');
  } else {
    showToast('❌ 操作失敗，請稍後再試');
  }
}
window.revokeAllGuests = revokeAllGuests;

// ── 訪客安全鎖（純計時器，訪客現在以 Owner email session 登入）──
// ── 訪客安全鎖：onSnapshot 監聽 guest_access/{uid}，Owner 刪除時即時鎖頁 ──
let _guestAccessUnsubscribe = null;
function _startGuestAccessWatcher(guestUid, ownerUid, expiresAt, guestAccessWritten) {
  // 先清除舊監聽，避免重複
  if (_guestAccessUnsubscribe) { _guestAccessUnsubscribe(); _guestAccessUnsubscribe = null; }

  // ① onSnapshot：Owner 主動刪除 guest_access → 即時鎖頁
  // ★ 重要：只有在 guest_access 文件確認寫入成功（guestAccessWritten=true）時才啟動 snapshot 監聽。
  //   若文件寫入失敗（Firestore 規則拒絕匿名用戶寫入），snapshot 一來就看到 !snap.exists()，
  //   會誤觸 _forceGuestLockout() 把資料清空。此時改用純 setTimeout 到期機制即可。
  if (guestAccessWritten && window._fbOnSnapshot && window._fbDb && window._fbDoc) {
    const ref = window._fbDoc(window._fbDb, 'guest_access', guestUid);
    let _firstSnap = true; // 第一次 snapshot 可能是「確認文件存在」的立即回呼，不視為被刪
    _guestAccessUnsubscribe = window._fbOnSnapshot(ref, (snap) => {
      if (_firstSnap) {
        _firstSnap = false;
        // 第一次回呼：若文件存在就繼續，若不存在（寫入剛失敗）才鎖定
        if (!snap.exists()) { _forceGuestLockout(); }
        else {
          const d = snap.data();
          const ms = typeof d.expiresAt === 'number' ? d.expiresAt : (d.expiresAt?.toMillis?.() ?? 0);
          if (Date.now() > ms) _forceGuestLockout();
        }
        return;
      }
      // 後續回呼：文件消失 = Owner 主動刪除
      if (!snap.exists()) {
        _forceGuestLockout();
        return;
      }
      const d = snap.data();
      const ms = typeof d.expiresAt === 'number' ? d.expiresAt : (d.expiresAt?.toMillis?.() ?? 0);
      if (Date.now() > ms) {
        _forceGuestLockout();
      }
    }, (err) => {
      // 監聽失敗（permission denied）：文件無法讀取，保守視為已被刪
      console.warn('[guestAccessWatcher] 監聽失敗:', err.code);
      // ★ 若是 permission-denied，可能是規則不允許匿名讀，不鎖定（改用 setTimeout 到期）
      if (err.code !== 'permission-denied') {
        _forceGuestLockout();
      }
    });
  }

  // ② setTimeout 備援：確保到期時一定鎖頁（onSnapshot 萬一斷線也有保障）
  // 無論 guestAccessWritten 如何，到期後一定鎖定
  const remaining = expiresAt - Date.now();
  if (remaining > 0) {
    setTimeout(() => { if (window._fbGuestSessionActive) _forceGuestLockout(); }, remaining);
    if (remaining > 5 * 60 * 1000) {
      setTimeout(() => { if (window._fbGuestSessionActive) showToast('⚠️ 訪客通行碼將在 5 分鐘後過期'); }, remaining - 5 * 60 * 1000);
    }
  }
}

// ── 強制訪客鎖定：清除敏感資料並跳回鎖屏 ──
function _forceGuestLockout() {
  if (!window._fbGuestSessionActive) return; // 非訪客 session 不受此限制

  // 停止所有監聽
  if (_guestAccessUnsubscribe) { _guestAccessUnsubscribe(); _guestAccessUnsubscribe = null; }
  if (typeof _fbUnsubscribe !== 'undefined' && _fbUnsubscribe) { _fbUnsubscribe(); _fbUnsubscribe = null; }

  // 清空記憶體中的敏感資料
  if (typeof state !== 'undefined') {
    state.tasks = [];
    state.sandbox = [];
    state.rewards = [];
    state.doneHistory = [];
    state.routines = [];
    state.customQuotes = [];
    state.done = 0;
    state.wishPoints = 0;
    state._initDone = false;
  }

  // 清除 sessionStorage（無痕模式）
  try { sessionStorage.removeItem('aethelgard_guest_uid'); } catch(e) {}
  window._fbUid = '';
  window._fbAuthUid = '';
  window._fbOwnerUid = '';
  window._fbIsOwner = false;
  window._fbGuestSessionActive = false;
  // 登出 Firebase Auth（訪客為匿名登入，直接 signOut）
  try {
    if (window._fbOwnerSignOut) window._fbOwnerSignOut().catch(() => {});
  } catch(e) {}

  // 立刻重繪為空
  if (typeof renderAll === 'function') renderAll();

  // 顯示主鎖屏（通行碼輸入）
  setTimeout(() => {
    showToast('🔒 通行證已失效，請重新輸入通行碼');
    setTimeout(openOwnerLoginOverlay, 800);
  }, 50);
}
window._forceGuestLockout = _forceGuestLockout;

function handleApiModalOverlayClick(e) {
  if (e.target === document.getElementById('apiModal')) closeApiModal();
}

function openApiModal() {
  const uid = window._fbUid || localStorage.getItem('aethelgard_fb_uid') || '';
  const clearBtn = document.getElementById('apiClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const tokenDisplay = document.getElementById('tokenDisplay');
  if (tokenDisplay) tokenDisplay.textContent = '——————';
  const tokenStatus = document.getElementById('tokenStatus');
  if (tokenStatus) tokenStatus.textContent = uid ? (window._fbIsOwner ? '✓ Owner 已登入' : '✓ 訪客模式中') : '正在連線 Firebase…';

  // 顯示 / 隱藏 Owner 專屬功能
  const revokeBtn = document.getElementById('revokeGuestsBtn');
  const signOutBtn = document.getElementById('ownerSignOutBtn');
  const tokenSection = document.getElementById('tokenDurationPills');
  const tokenGenBtn = tokenSection ? tokenSection.closest('div') : null;
  if (revokeBtn) revokeBtn.style.display = window._fbIsOwner ? 'inline-block' : 'none';
  if (signOutBtn) signOutBtn.style.display = window._fbIsOwner ? 'inline-block' : 'none';

  const savedTime = localStorage.getItem('aethelgard_reset_time') || '04:00';
  document.getElementById('resetTimeInput').value = savedTime;
  const savedNeglect = localStorage.getItem('aethelgard_neglect_days') || '7';
  const neglectEl = document.getElementById('neglectDaysInput');
  if (neglectEl) neglectEl.value = savedNeglect;
  document.getElementById('apiModal').classList.add('open');
}

function closeApiModal() {
  document.getElementById('apiModal').classList.remove('open');
}

// ── 備份匯入（設定頁）──────────────────────────────────────────────────
async function handleImportBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('importBackupStatus');
  statusEl.textContent = '讀取中…';
  statusEl.style.color = 'var(--text-faint)';

  let raw;
  try { raw = await file.text(); } catch(e) { statusEl.textContent = '❌ 無法讀取檔案'; statusEl.style.color = 'var(--rose)'; return; }

  let backup;
  try { backup = JSON.parse(raw); } catch(e) { statusEl.textContent = '❌ JSON 格式錯誤'; statusEl.style.color = 'var(--rose)'; return; }

  // ── 工具：Firestore Native 格式 → JS 值 ──
  function _toJS(v) {
    if (!v || typeof v !== 'object') return v;
    if (v.stringValue  !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue  !== undefined) return v.doubleValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.nullValue    !== undefined) return null;
    if (v.timestampValue !== undefined) return new Date(v.timestampValue);
    if (v.arrayValue)  return (v.arrayValue.values || []).map(_toJS);
    if (v.mapValue) {
      const obj = {};
      for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = _toJS(val);
      return obj;
    }
    return v;
  }

  // 支援兩種格式：Firestore Native（有 fields 包裝）或已解析的純 JS 物件
  function _extractDoc(docsArr) {
    if (!Array.isArray(docsArr) || docsArr.length === 0) return null;
    const doc = docsArr[0];
    if (doc && doc.fields) {
      // Firestore Native 格式
      const result = {};
      for (const [k, v] of Object.entries(doc.fields)) result[k] = _toJS(v);
      return result;
    }
    return doc; // 已是純 JS
  }

  try {
    // ── 只處理 Aethelgard/data（核心資料），略過 notes、tokens、users ──
    const aethDocs = backup['Aethelgard'];
    if (!aethDocs || !Array.isArray(aethDocs) || aethDocs.length === 0) {
      statusEl.textContent = '❌ 找不到 Aethelgard 資料'; statusEl.style.color = 'var(--rose)'; return;
    }
    const data = _extractDoc(aethDocs);
    if (!data) { statusEl.textContent = '❌ 無法解析資料'; statusEl.style.color = 'var(--rose)'; return; }

    // ── 套用到 state（略過 notes）──
    if (Array.isArray(data.tasks))       state.tasks       = data.tasks;
    if (Array.isArray(data.rewards))     state.rewards     = data.rewards;
    if (Array.isArray(data.doneHistory)) state.doneHistory = data.doneHistory;
    if (Array.isArray(data.routines))    state.routines    = data.routines;
    if (Array.isArray(data.customQuotes)) state.customQuotes = data.customQuotes;
    if (Array.isArray(data.sandbox))     state.sandbox     = data.sandbox;
    if (Array.isArray(data.todayOrder))  state.todayOrder  = data.todayOrder;
    if (typeof data.done === 'number')        state.done       = data.done;
    if (typeof data.energy === 'number')      state.energy     = data.energy;
    if (typeof data.wishPoints === 'number')  state.wishPoints = data.wishPoints;
    if (data.lotteryState && typeof data.lotteryState === 'object') {
      lotteryState = { ...lotteryState, ...data.lotteryState };
      saveLottery();
    }
    if (data.morningDialogShownDate) state.morningDialogShownDate = data.morningDialogShownDate;
    if (data.routineResetDate)       state.routineResetDate       = data.routineResetDate;
    if (data.settings) {
      if (data.settings.resetTime)    localStorage.setItem('aethelgard_reset_time', data.settings.resetTime);
      if (data.settings.neglectDays)  localStorage.setItem('aethelgard_neglect_days', String(data.settings.neglectDays));
    }

    // ── 也還原 IsolaPath（若有）──
    const isolaDocs = backup['IsolaPath'];
    if (isolaDocs && Array.isArray(isolaDocs) && isolaDocs.length > 0 && window._fbDb && window._fbSetDoc && window._fbDoc) {
      const isolaData = _extractDoc(isolaDocs);
      if (isolaData) {
        await window._fbSetDoc(window._fbDoc(window._fbDb, 'IsolaPath', 'data'), isolaData, { merge: true });
      }
    }

    saveStateLocal();
    _syncNow();
    renderAll();
    initRoutines();
    checkTaskDates();

    statusEl.textContent = '✅ 匯入成功！';
    statusEl.style.color = 'var(--green)';
    showToast('✅ 備份已還原！');
    input.value = ''; // 清除 input，讓同一檔案可重複選取
  } catch(e) {
    console.error('[匯入備份]', e);
    statusEl.textContent = '❌ 匯入失敗：' + e.message;
    statusEl.style.color = 'var(--rose)';
  }
}
window.handleImportBackup = handleImportBackup;

let _tokenExpireTimer = null;
let _selectedTokenMinutes = 30; // 預設 30 分鐘

function selectTokenDuration(btn, minutes) {
  _selectedTokenMinutes = minutes;
  document.querySelectorAll('#tokenDurationPills button').forEach(b => {
    const active = b === btn;
    b.style.background = active ? 'var(--green)' : 'transparent';
    b.style.color = active ? 'var(--bg)' : 'var(--text-dim)';
    b.style.borderColor = active ? 'var(--green)' : 'var(--border)';
  });
}
window.selectTokenDuration = selectTokenDuration;

async function generateToken() {
  if (window._fbGuestSessionActive) {
    const ts = document.getElementById('tokenStatus');
    if (ts) ts.textContent = '❌ 只有 Owner 才能產生通行碼';
    return;
  }
  if (!window._fbUid || !window._fbDb) {
    const ts = document.getElementById('tokenStatus');
    if (ts) ts.textContent = '尚未連線 Firebase，請稍候再試';
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const TOKEN_DURATION = _selectedTokenMinutes * 60 * 1000;
  const expiresAt = Date.now() + TOKEN_DURATION;
  const ownerUid = window._fbUid;   // 只存 ownerUid，不存 email/password
  const label = _selectedTokenMinutes < 60
    ? `${_selectedTokenMinutes} 分鐘`
    : `${_selectedTokenMinutes / 60} 小時`;
  try {
    await window._fbSetDoc(window._fbDoc(window._fbDb, 'tokens', code), {
      ownerUid, expiresAt
    });
    const display = document.getElementById('tokenDisplay');
    const ts = document.getElementById('tokenStatus');
    if (display) {
      display.textContent = code;
      display.style.cursor = 'pointer';
      display.onclick = () => { navigator.clipboard.writeText(code).then(() => { if (ts) ts.textContent = '✓ 已複製！'; }); };
    }
    if (ts) ts.textContent = `${label}內有效 · 用完自動刪除 · 點數字複製`;
    if (_tokenExpireTimer) clearTimeout(_tokenExpireTimer);
    _tokenExpireTimer = setTimeout(() => {
      if (display) { display.textContent = '——————'; display.style.cursor = ''; display.onclick = null; }
      if (ts) ts.textContent = '通行碼已過期';
    }, TOKEN_DURATION);
  } catch(e) {
    const ts = document.getElementById('tokenStatus');
    if (ts) ts.textContent = '產生失敗：' + e.message;
  }
}

function openGuestTokenOverlay() {
  const el = document.getElementById('guestTokenOverlay');
  if (el) { el.style.display = 'flex'; setTimeout(() => { const i = document.getElementById('guestTokenInput'); if(i) i.focus(); }, 100); }
}
function closeGuestTokenOverlay() {
  const el = document.getElementById('guestTokenOverlay');
  if (el) el.style.display = 'none';
}
function copyDeviceUid() {
  const uid = window._fbAuthUid || window._fbUid || '';
  if (!uid) { document.getElementById('guestTokenError').textContent = '尚未取得裝置 ID'; return; }
  navigator.clipboard.writeText(uid).then(() => {
    const errEl = document.getElementById('guestTokenError');
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✓ 裝置 ID 已複製';
    setTimeout(() => { errEl.textContent = ''; errEl.style.color = ''; }, 3000);
  }).catch(() => {
    document.getElementById('guestTokenError').textContent = uid;
  });
}


async function submitGuestToken() {
  // 主鎖屏中的 input（id="guestTokenInput"）
  const input = document.getElementById('guestTokenInput');
  const errEl = document.getElementById('guestTokenError');
  if (!input || !errEl) return;
  const code = (input.value || '').trim();
  if (!/^\d{6}$/.test(code)) {
    errEl.textContent = '請輸入 6 位數字';
    if (typeof window._otpFlashError === 'function') window._otpFlashError();
    return;
  }
  errEl.textContent = '驗證中…'; errEl.style.color = '';
  try {
    const tokenRef = window._fbDoc(window._fbDb, 'tokens', code);
    const snap = await window._fbGetDoc(tokenRef);
    if (!snap.exists()) { errEl.textContent = '通行碼不存在或已被使用'; return; }
    const data = snap.data();
    if (Date.now() > data.expiresAt) { errEl.textContent = '通行碼已過期，請重新申請'; return; }

    const ownerUid = data.ownerUid;
    if (!ownerUid) {
      errEl.textContent = '通行碼格式不正確，請請 Owner 重新產生';
      errEl.style.color = 'var(--rose)';
      return;
    }

    // ── 以匿名身份登入（保持匿名，不用 email/password）──
    errEl.textContent = '登入中…'; errEl.style.color = '';
    window._fbGuestSessionActive = true;  // 告知 onAuthStateChanged 這是訪客 session
    window._fbIsOwner = true;  // ★ 訪客通過 OTP 驗證後享有完整 Owner 權限（讀寫/編輯全開）
    // ★ 第二個競態條件的修正：guest_access/{guestUid} 文件還沒寫入完成前，
    //   不能讓 onAuthStateChanged 提前呼叫 _onFirebaseReadyCallback()。
    //   因為 Firestore 安全規則很可能靠 guest_access/{uid} 是否存在來判斷訪客
    //   有沒有權限讀 Aethelgard/data；signInAnonymously() 一成功，onAuthStateChanged
    //   就會觸發，但這時 guest_access 文件還沒寫到伺服器上，會被權限規則擋下來，
    //   讀取直接失敗回傳 null —— 這就是無痕模式下「驗證碼登入後讀不到任務資料」的成因。
    window._fbGuestAccessPending = true;

    // ★ 修正競態條件：_fbUid 必須在呼叫 signInAnonymously() 之前就設成 ownerUid。
    //   原因：signInAnonymously() 若需要真的跟 Firebase 伺服器來回建立全新匿名帳號
    //   （無痕模式下一定會，因為沒有任何快取憑證），onAuthStateChanged 監聽器可能在
    //   這個 await 真正 resolve 回來之前就先被觸發，並呼叫 _onFirebaseReadyCallback()
    //   讓 init() 提前繼續往下跑去呼叫 loadFromCloud()——這時若 _fbUid 還是空字串，
    //   loadFromCloud() 會直接判斷「未就緒」並回傳 false，資料就讀空了。
    //   ownerUid 在這裡已經從 token 文件讀出來了，不需要等匿名登入完成才能設定。
    window._fbUid = ownerUid;
    window._fbOwnerUid = ownerUid;
    try { sessionStorage.setItem('aethelgard_guest_uid', ownerUid); } catch(e) {}

    const guestUser = await window._fbGuestSignInAnon();
    const guestUid = guestUser.uid;
    window._fbAuthUid = guestUid;

    // ── 用完即刪 token ──
    try { await window._fbDeleteDoc(tokenRef); } catch(delErr) {
      console.warn('[guest] token 刪除失敗（不影響登入流程）', delErr);
    }

    if (typeof _lastSyncHash !== 'undefined') _lastSyncHash = '';
    // ★ 切換 UID 後立刻抑制 snapshot，避免舊版 snapshot 在 init/loadFromCloud 完成前進來蓋掉資料
    if (typeof _markSyncWrite === 'function') _markSyncWrite();

    // ── 建立有時效的訪客通行證 ──
    const TOKEN_DURATION = data.expiresAt - Date.now();
    const passExpiresAt = Date.now() + TOKEN_DURATION;
    let _guestAccessWritten = false;
    try {
      await window._fbSetDoc(window._fbDoc(window._fbDb, 'guest_access', guestUid), {
        ownerUid: ownerUid,
        grantedAt: Date.now(),
        expiresAt: passExpiresAt
      });
      _guestAccessWritten = true;
    } catch(gaErr) {
      console.warn('[guest] guest_access 寫入失敗（不影響登入流程）', gaErr);
    }
    // ★ guest_access 寫入嘗試（成功或失敗）已經結束，現在才能放行 ready callback。
    //   不論成功失敗都要清除，否則寫入失敗時會永遠卡住、永遠不呼叫 ready callback。
    window._fbGuestAccessPending = false;

    // ── 啟動 onSnapshot 監聽 + 到期計時器（統一由 _startGuestAccessWatcher 管理）──
    _startGuestAccessWatcher(guestUid, ownerUid, passExpiresAt, _guestAccessWritten);

    const remaining = passExpiresAt - Date.now();
    const labelMin = Math.round(remaining / 60000);
    const label = labelMin < 60 ? labelMin + ' 分鐘' : Math.round(labelMin/60) + ' 小時';

    // ── 切換主鎖屏為載入提示 ──
    const _loadingOverlay = document.getElementById('ownerLoginOverlay');
    if (_loadingOverlay) {
      _loadingOverlay.style.display = 'flex';
      const _card = document.getElementById('ownerLoginCard');
      if (_card) {
        _card.innerHTML = '<div style="font-size:40px;margin-bottom:16px">🔑</div>'
          + '<div style="font-family:\'DM Serif Display\',serif;font-size:20px;color:var(--green);margin-bottom:8px">Aethelgard</div>'
          + '<div style="font-size:13px;color:var(--text-dim);letter-spacing:0.04em">訪客模式啟用中，正在載入資料…</div>';
      }
    }

    showToast('🔑 訪客模式已啟用（' + label + '），正在載入資料…');
    // ★ Fix：統一呼叫，不論 init 是否已到達等待點都能正確 resolve
    if (typeof window._onFirebaseReadyCallback === 'function') {
      window._onFirebaseReadyCallback();
    } else if (typeof window._fbGuestReadyResolve === 'function') {
      window._fbGuestReadyResolve();
    }
    // ★ 保底：若 init() → loadFromCloud() 流程因任何原因未能關閉 overlay，
    //   8 秒後強制關閉，防止永久卡在載入畫面
    setTimeout(() => {
      if (typeof closeOwnerLoginOverlay === 'function') closeOwnerLoginOverlay();
    }, 8000);
  } catch(e) {
    window._fbGuestSessionActive = false;
    errEl.textContent = '驗證失敗：' + e.message;
    errEl.style.color = 'var(--rose)';
    if (typeof window._otpFlashError === 'function') window._otpFlashError();
  }
}

// ── Race condition fix：init() 用這個函式來設定 callback，而不是直接賦值 ──
// 如果 onAuthStateChanged 比 init() 更早觸發（module 非同步載入造成），
// _firebaseReadyPending 會是 true，這裡會立刻補呼叫，不會卡住。
window._registerFirebaseReadyCallback = function(cb) {
  window._onFirebaseReadyCallback = cb;
  if (window._firebaseReadyPending) {
    window._firebaseReadyPending = false;
    cb();
  }
};
