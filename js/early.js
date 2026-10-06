(function() {
  // ── 「正在驗證身份」載入畫面：藍色轉圈圈，周圍三顆金色星星輪流閃爍 ──
  // 樣式寫在這裡（不依賴其他 CSS 檔），因為這是最先看到的畫面。
  // 想隨時看這個畫面：網址後面加  ?preview=loading  （點一下畫面關閉）
  var AV_CSS = ''
    + '.av{display:flex;flex-direction:column;align-items:center;gap:8px}'
    + '.av-stage{position:relative;width:150px;height:130px;display:flex;align-items:center;justify-content:center}'
    + '.av-ring{width:56px;height:56px;animation:avSpin .9s linear infinite}'
    + '.av-ring circle{fill:none;stroke-width:4.5}'
    + '.av-ring .t{stroke:rgba(58,110,165,.16)}'
    + '.av-ring .a{stroke:var(--green,#3A6EA5);stroke-linecap:round;stroke-dasharray:38 100}'
    + '.av-star{position:absolute;color:#e8c35a;line-height:1;pointer-events:none;text-shadow:0 0 8px rgba(232,195,90,.7);animation:avTwinkle 1.8s ease-in-out infinite}'
    + '.av-star.a{left:10px;top:14px;font-size:30px}'
    + '.av-star.b{right:8px;top:30px;font-size:22px;animation-delay:.6s}'
    + '.av-star.c{left:38px;bottom:4px;font-size:17px;animation-delay:1.2s}'
    + '.av-title{font-family:\'DM Serif Display\',serif;font-size:22px;color:var(--green,#3A6EA5)}'
    + '.av-text{font-size:14px;color:var(--text-dim,#7a8aa0);letter-spacing:.06em}'
    + '@keyframes avSpin{to{transform:rotate(360deg)}}'
    + '@keyframes avTwinkle{0%,100%{opacity:.15;transform:scale(.55) rotate(0)}50%{opacity:1;transform:scale(1.2) rotate(30deg)}}'
    + '@media (prefers-reduced-motion:reduce){.av-ring{animation-duration:2.4s}.av-star{animation:none;opacity:.8}}';

  var AV_HTML = '<div class="av">'
    + '<div class="av-stage">'
    +   '<svg class="av-ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="t" cx="28" cy="28" r="22"/><circle class="a" cx="28" cy="28" r="22"/></svg>'
    +   '<span class="av-star a">✦</span><span class="av-star b">✦</span><span class="av-star c">✦</span>'
    + '</div>'
    + '<div class="av-title">Aethelgard</div>'
    + '<div class="av-text">正在驗證身份…</div>'
    + '</div>';

  var st = document.createElement('style'); st.textContent = AV_CSS; (document.head || document.documentElement).appendChild(st);

  // 預覽：?preview=loading → 蓋一層一樣的畫面在最上面，點一下就關掉
  document.addEventListener('DOMContentLoaded', function() {
    if (!/[?&]preview=loading\b/.test(location.search)) return;
    var pv = document.createElement('div');
    pv.id = 'avPreview';
    pv.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;visibility:visible !important;'
      + 'background:linear-gradient(160deg,#e8f0f8 0%,#f4f7fc 45%,#e2eaf4 100%);cursor:pointer';
    pv.innerHTML = AV_HTML + '<div style="position:absolute;bottom:28px;font-size:12px;color:#9aa8bb">預覽中，點一下關閉</div>';
    pv.onclick = function() { pv.remove(); };
    document.body.appendChild(pv);
  });

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
        card.innerHTML = AV_HTML;
      }
    } else {
      // 沒有 Owner 記錄 → 顯示完整鎖屏（OTP 輸入）
      overlay.style.display = 'flex';
    }
  });
})();
