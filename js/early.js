(function() {
  try {
    var ownerUid = localStorage.getItem('aethelgard_fb_owner_uid') || localStorage.getItem('aethelgard_fb_uid');
    window._earlyHasOwner = !!ownerUid;
  } catch(e) { window._earlyHasOwner = false; }
  // 立即決定鎖屏初始狀態
  document.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('ownerLoginOverlay');
    var card = document.getElementById('ownerLoginCard');
    if (!overlay) return;
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
