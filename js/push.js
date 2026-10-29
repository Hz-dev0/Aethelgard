/* 推播通知（手機）。
   - 開啟：要通知權限 → 取得 FCM token → 存進 Firestore（Aethelgard/todo 的 tokens 欄位，不影響任務資料）
   - 手機沒開 App 時：由 GitHub Actions 每 5 分鐘跑 scripts/send-reminders.js，到時間就推送
   - App 開著時：這裡每 30 秒自己檢查一次，準時跳通知（跟伺服器共用 tag，不會重複） */
(function () {
  // ★ Firebase 主控台 → 專案設定 → Cloud Messaging → 網路推送憑證 → 產生金鑰組，把公開金鑰貼在這裡
  const VAPID_KEY = '';
  const DEV_K = 'aeth_push_dev', ON_K = 'aeth_push_on', FIRED_K = 'aeth_push_fired';

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const devId = () => {
    let d = localStorage.getItem(DEV_K);
    if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEV_K, d); }
    return d;
  };
  const on = () => supported() && Notification.permission === 'granted' && localStorage.getItem(ON_K) === '1';
  const ref = () => window._fbDoc(window._fbDb, 'Aethelgard', 'todo');
  const swReg = () => navigator.serviceWorker.ready;

  async function enable() {
    if (!supported()) throw new Error('這個瀏覽器不支援通知（iPhone 請先「加入主畫面」再開啟）');
    if (!VAPID_KEY) throw new Error('還沒設定 VAPID 公開金鑰（js/push.js）');
    if (!(window._fbIsOwner && window._fbUid && window._fbDb && window._fbApp)) throw new Error('尚未連上雲端');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('通知權限沒有開（到手機設定裡允許通知）');
    const reg = await swReg();
    const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
    const token = await getToken(getMessaging(window._fbApp), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error('取不到通知 token');
    await window._fbSetDoc(ref(), { tokens: { [devId()]: { t: token, at: Date.now() } } }, { merge: true });
    localStorage.setItem(ON_K, '1');
    startLocal();
  }

  async function disable() {
    localStorage.setItem(ON_K, '0');
    try {
      const { getMessaging, deleteToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js');
      await deleteToken(getMessaging(window._fbApp));
    } catch (e) {}
    try { await window._fbSetDoc(ref(), { tokens: { [devId()]: { t: '', at: Date.now() } } }, { merge: true }); } catch (e) {}
  }

  async function test() {
    if (!on()) throw new Error('請先開啟通知');
    const reg = await swReg();
    await reg.showNotification('Aethelgard', { body: '通知正常 ✓', tag: 'aeth-test', icon: '/Aethelgard/icon.png' });
    return '已送出測試通知';
  }

  /* ── App 開著時的本機提醒 ── */
  const fired = () => { try { return JSON.parse(localStorage.getItem(FIRED_K) || '{}'); } catch (e) { return {}; } };
  async function tick() {
    if (!on() || !window._todoState) return;
    const S = window._todoState(), cfg = S.cfg || {};
    const lead = (cfg.remindMin >= 0 ? cfg.remindMin : 10) * 6e4, def = cfg.remindDef === 0 ? 0 : 1, now = Date.now();
    const f = fired();
    let changed = false;
    const jobs = [];
    for (const t of S.tasks || []) {
      if (t.done) continue;
      if (t.date && t.time && (t.rm === undefined ? def : t.rm) !== 0)
        jobs.push({ key: t.id + '|' + t.date + '|' + t.time + '|' + lead, title: t.name, sub: '', time: t.time,
          due: new Date(t.date + 'T' + t.time).getTime(), tag: 't-' + t.id + '-' + t.date + '-' + t.time });
      for (const x of t.subs || []) {   // 小步驟自己的提醒：不受任務的提醒開關影響，設了就會提醒
        if (x.done || !x.rd || !x.rt) continue;
        jobs.push({ key: 's' + x.id + '|' + t.id + '|' + x.rd + '|' + x.rt + '|' + lead, title: t.name, sub: x.text, time: x.rt,
          due: new Date(x.rd + 'T' + x.rt).getTime(), tag: 's-' + t.id + '-' + x.id + '-' + x.rd + '-' + x.rt });
      }
    }
    for (const j of jobs) {
      if (!(now >= j.due - lead && now <= j.due + 30 * 6e4)) continue;
      if (f[j.key]) continue;
      const left = Math.round((j.due - now) / 6e4);
      try {
        const reg = await swReg();
        await reg.showNotification(j.title, {
          body: (j.sub ? j.sub + '｜' : '') + (left > 0 ? '還有 ' + left + ' 分鐘' : '時間到了') + '（' + j.time + '）',
          tag: j.tag, icon: '/Aethelgard/icon.png',
        });
        f[j.key] = now; changed = true;
      } catch (e) {}
    }
    if (changed) {
      Object.keys(f).forEach(k => { if (now - f[k] > 2 * 864e5) delete f[k]; });
      try { localStorage.setItem(FIRED_K, JSON.stringify(f)); } catch (e) {}
    }
  }
  let timer = 0;
  function startLocal() { if (!timer) { timer = setInterval(tick, 30000); tick(); } }
  if (on()) startLocal();

  window._push = { supported, on, enable, disable, test };
})();
