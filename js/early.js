(function() {
  try {
    var ownerUid = localStorage.getItem('aethelgard_fb_owner_uid') || localStorage.getItem('aethelgard_fb_uid');
    window._earlyHasOwner = !!ownerUid;
  } catch(e) { window._earlyHasOwner = false; }
  // ★ 靜默重整：離開背景過久 / SW 更新觸發的自動 location.reload()，
  //   在 reload 前會先寫入這個一次性旗標。讀到旗標代表「這是同一個已驗證
  //   的 Owner session 自己觸發的重整」，不是全新造訪，不需要再顯示
  //   「🔐 正在驗證身份…」這個鎖屏畫面——直接讓鎖屏保持隱藏，主畫面內容
  //   依然會透過 body.auth-ready 那道 CSS 閘門擋著，不會閃過舊資料，
  //   使用者看到的只是很短暫的空白，資料備妥後就直接無感切換過去。
  var _silentReload = false;
  try {
    if (sessionStorage.getItem('aethelgard_silent_reload') === '1') {
      _silentReload = true;
      sessionStorage.removeItem('aethelgard_silent_reload'); // 一次性，用過即丟
    }
  } catch(e) {}
  window._earlySilentReload = _silentReload;
  // 立即決定鎖屏初始狀態
  document.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('ownerLoginOverlay');
    var card = document.getElementById('ownerLoginCard');
    if (!overlay) return;
    if (_silentReload && window._earlyHasOwner) {
      // 靜默重整：鎖屏整個不顯示，主畫面照舊被 CSS 擋著直到驗證完成
      overlay.style.display = 'none';
      return;
    }
    if (window._earlyHasOwner) {
      // 有 Owner 記錄 → 顯示載入畫面（不顯示 OTP 格）
      overlay.style.display = 'flex';
      if (card) {
        card.innerHTML = '<div style="font-size:40px;margin-bottom:16px">🔐</div>'
          + '<div style="font-family:\'DM Serif Display\',serif;font-size:20px;color:var(--green);margin-bottom:8px">Aethelgard</div>'
          + '<div style="font-size:13px;color:var(--text-dim);letter-spacing:0.04em">正在驗證身份…</div>';
      }
    } else {
      // 沒有 Owner 記錄 → 顯示完整鎖屏（OTP 輸入）
      overlay.style.display = 'flex';
    }
  });
})();
