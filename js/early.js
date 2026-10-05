(function() {
  // ── 「正在驗證身份」載入畫面：圓滾滾的小鎖頭（會眨眼、上下彈跳、鎖環偶爾晃一下），旁邊有星星閃爍 ──
  // 樣式寫在這裡（不依賴其他 CSS 檔），因為這是最先看到的畫面。
  var AV_CSS = ''
    + '.av{display:flex;flex-direction:column;align-items:center;gap:6px}'
    + '.av-stage{position:relative;width:132px;height:132px}'
    + '.av-lock{width:132px;height:132px;display:block;animation:avBob 2.2s ease-in-out infinite;transform-origin:50% 90%}'
    + '.av-shadow{position:absolute;left:50%;bottom:2px;width:70px;height:10px;margin-left:-35px;border-radius:50%;background:rgba(58,110,165,.16);animation:avShadow 2.2s ease-in-out infinite}'
    + '.av-shackle{transform-origin:60px 56px;animation:avShackle 3.4s ease-in-out infinite}'
    + '.av-eye{transform-box:fill-box;transform-origin:center;animation:avBlink 3.6s infinite}'
    + '.av-sp{position:absolute;color:#e8c35a;line-height:1;animation:avTwinkle 1.8s ease-in-out infinite;pointer-events:none}'
    + '.av-sp.a{left:6px;top:20px;font-size:16px}'
    + '.av-sp.b{right:4px;top:34px;font-size:12px;animation-delay:.6s}'
    + '.av-sp.c{right:18px;top:2px;font-size:10px;animation-delay:1.1s}'
    + '.av-title{font-family:\'DM Serif Display\',serif;font-size:22px;color:var(--green,#3A6EA5);margin-top:4px}'
    + '.av-text{font-size:14px;color:var(--text-dim,#7a8aa0);letter-spacing:.06em;display:flex;align-items:center;gap:2px}'
    + '.av-dots i{display:inline-block;width:5px;height:5px;margin-left:3px;border-radius:50%;background:var(--green,#3A6EA5);animation:avDot 1.2s ease-in-out infinite}'
    + '.av-dots i:nth-child(2){animation-delay:.15s}.av-dots i:nth-child(3){animation-delay:.3s}'
    + '.av-sub{height:18px;font-size:12px;color:var(--text-dim,#7a8aa0);opacity:.85;animation:avFade .5s ease both}'
    + '@keyframes avBob{0%,100%{transform:translateY(0) scale(1,1)}45%{transform:translateY(-10px) scale(.98,1.03)}85%{transform:translateY(0) scale(1.04,.95)}}'
    + '@keyframes avShadow{0%,100%{transform:scaleX(1);opacity:1}45%{transform:scaleX(.72);opacity:.55}}'
    + '@keyframes avShackle{0%,58%,100%{transform:translateY(0) rotate(0)}64%{transform:translateY(-7px) rotate(-9deg)}70%{transform:translateY(-7px) rotate(8deg)}76%{transform:translateY(-4px) rotate(-5deg)}84%{transform:translateY(0) rotate(0)}}'
    + '@keyframes avBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}'
    + '@keyframes avTwinkle{0%,100%{opacity:.15;transform:scale(.6) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(25deg)}}'
    + '@keyframes avDot{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:1}}'
    + '@keyframes avFade{from{opacity:0;transform:translateY(3px)}to{opacity:.85;transform:none}}'
    + '@media (prefers-reduced-motion:reduce){.av-lock,.av-shadow,.av-shackle,.av-eye,.av-sp,.av-dots i,.av-sub{animation:none}.av-sp{opacity:.7}}';

  var AV_HTML = '<div class="av">'
    + '<div class="av-stage">'
    +   '<svg class="av-lock" viewBox="0 0 120 120" aria-hidden="true">'
    +     '<g class="av-shackle"><path d="M42 58V42a18 18 0 0 1 36 0v16" fill="none" stroke="#829AB1" stroke-width="9" stroke-linecap="round"/></g>'
    +     '<rect x="24" y="54" width="72" height="54" rx="18" fill="#3A6EA5"/>'
    +     '<rect x="24" y="54" width="72" height="20" rx="10" fill="#fff" opacity=".12"/>'
    +     '<ellipse class="av-eye" cx="46" cy="78" rx="5" ry="6" fill="#fff"/>'
    +     '<ellipse class="av-eye" cx="74" cy="78" rx="5" ry="6" fill="#fff"/>'
    +     '<circle cx="37" cy="88" r="5" fill="#ff9fb3" opacity=".55"/>'
    +     '<circle cx="83" cy="88" r="5" fill="#ff9fb3" opacity=".55"/>'
    +     '<path d="M54 89q6 6 12 0" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
    +   '</svg>'
    +   '<span class="av-sp a">✦</span><span class="av-sp b">✦</span><span class="av-sp c">✦</span>'
    +   '<div class="av-shadow"></div>'
    + '</div>'
    + '<div class="av-title">Aethelgard</div>'
    + '<div class="av-text">正在驗證身份<span class="av-dots"><i></i><i></i><i></i></span></div>'
    + '<div class="av-sub" id="avSub">敲敲門…</div>'
    + '</div>';

  // 等比較久時，下面那行小字會輪流換（畫面消失後自動停止）
  function startAvMessages() {
    var msgs = ['敲敲門…', '對一下暗號…', '翻翻鑰匙…', '快好了～', '再等我一下下…'], i = 0;
    var t = setInterval(function() {
      var el = document.getElementById('avSub');
      if (!el) { clearInterval(t); return; }
      i = (i + 1) % msgs.length;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';   // 重新播放淡入
      el.textContent = msgs[i];
    }, 2400);
  }

  var st = document.createElement('style'); st.textContent = AV_CSS; (document.head || document.documentElement).appendChild(st);

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
        startAvMessages();
      }
    } else {
      // 沒有 Owner 記錄 → 顯示完整鎖屏（OTP 輸入）
      overlay.style.display = 'flex';
    }
  });
})();
