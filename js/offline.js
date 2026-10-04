// 離線入口：已經登入過的手機，在沒網路（或網路很慢）時也能直接進來，用本機資料操作。
// 連上網後，任務區 / 筆記區會各自把本機的修改同步回雲端（見 todo.js、sync.js）。
//
// 為什麼需要它：原本主畫面要等 Firebase 驗證完成才顯示，沒網路時驗證永遠等不到，
// 畫面就卡在「正在驗證身份…」。這裡只做一件事——等一下還沒好就先放行，
// 看到的只有「這支手機上本來就存著的資料」，不會多暴露任何東西。
(function() {
  if (!window._earlyHasOwner) return;   // 這支手機沒登入過 Owner，一定要走正常登入
  let entered = false;

  function enter() {
    if (entered) return;
    if (document.body.classList.contains('auth-ready')) return;   // 已經正常進來了
    entered = true;
    window._offlineMode = true;
    const ov = document.getElementById('ownerLoginOverlay');
    if (ov) ov.style.display = 'none';
    document.body.classList.add('auth-ready');
  }

  function check(final) {
    if (document.body.classList.contains('auth-ready')) return;
    // Firebase 沒載入（_fbDb 不存在）或明確離線，都先放行
    if (navigator.onLine === false || !window._fbDb) enter();
    else if (final) enter();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => check(false), 2500);
    setTimeout(() => check(true), 9000);   // 有網路但太慢：9 秒後也先放行（正常驗證完成後仍會接手）
  });
  window.addEventListener('offline', () => setTimeout(() => check(false), 1500));

  // 這次開啟時 Firebase SDK 根本沒載入成功（完全離線冷啟動）。連上網後只能重新載入一次才拿得到 SDK。
  // 本機的修改都已存在 localStorage，重新載入後會由同步流程推上雲端。
  window.addEventListener('online', () => {
    if (!entered || window._fbDb) return;
    try { if (typeof notesFlush === 'function') notesFlush(); } catch (e) {}
    try { if (typeof notesSave === 'function') notesSave(); } catch (e) {}
    try { if (typeof window._saveReloadRestoreState === 'function') window._saveReloadRestoreState(); } catch (e) {}
    setTimeout(() => location.reload(), 600);
  });
})();
