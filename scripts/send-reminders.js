// 由 GitHub Actions 每 5 分鐘執行：找出「快到期」的任務，推播到已開啟通知的手機。
// 需要 repo secret：FIREBASE_SERVICE_ACCOUNT（Firebase 服務帳戶金鑰的整份 JSON）
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const GRACE = 60 * 6e4;   // GitHub 排程常延遲 10～30 分鐘甚至整輪跳過：最晚還能補發到到期後 60 分鐘

(async () => {
  const ref = db.doc('Aethelgard/todo');
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data();
  const S = JSON.parse(d.json || '{}'), cfg = S.cfg || {};
  const lead = (cfg.remindMin >= 0 ? cfg.remindMin : 10) * 6e4;
  const def = cfg.remindDef === 0 ? 0 : 1;
  const tzo = typeof cfg.tzo === 'number' ? cfg.tzo : 480;   // 手機所在時區（UTC 往東幾分鐘），預設台灣
  const devices = Object.entries(d.tokens || {}).filter(([, v]) => v && v.t);
  if (!devices.length) return;

  const logRef = db.doc('Aethelgard/pushlog');
  const sent = ((await logRef.get()).data() || {}).sent || {};
  const now = Date.now();
  const reset = typeof cfg.reset === 'number' ? cfg.reset : 4;   // 每日重置時間：跟 App 的 today() 一樣，過了這個鐘點才算新的一天
  const todayStr = new Date(now + tzo * 6e4 - reset * 36e5).toISOString().slice(0, 10);
  const isRep = t => !!(t.repeat || (t.wd && t.wd.length));

  const jobs = [];
  const add = (key, title, sub, time, date, tag) => {
    const due = Date.parse(date + 'T' + time + ':00Z') - tzo * 6e4;
    if (!(now >= due - lead && now <= due + GRACE)) return;
    if (sent[key]) return;
    jobs.push({ key, title, sub, time, due, tag });
  };
  for (const t of S.tasks || []) {
    if (t.done) continue;
    // 重複任務漏做：App 開啟時才會順延成今天，沒開 App 的日子雲端日期還是舊的 → 這裡照 App 的規則（rollRep）算出「有效日期」，提醒才不會斷
    let date = t.date;
    if (date && isRep(t) && date < todayStr && !(t.until && t.until < todayStr)) date = todayStr;
    if (date && t.time && (t.rm === undefined ? def : t.rm) !== 0)
      add(t.id + '|' + date + '|' + t.time + '|' + lead, t.name, '', t.time, date, 't-' + t.id + '-' + date + '-' + t.time);
    for (const x of t.subs || []) {   // 小步驟自己的提醒：不受任務的提醒開關影響，設了就會提醒
      if (x.done || !x.rd || !x.rt) continue;
      add('s' + x.id + '|' + t.id + '|' + x.rd + '|' + x.rt + '|' + lead, t.name, x.text, x.rt, x.rd, 's-' + t.id + '-' + x.id + '-' + x.rd + '-' + x.rt);
    }
  }

  for (const { title, sub, time, due, tag, key } of jobs) {
    const left = Math.round((due - now) / 6e4);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: devices.map(([, v]) => v.t),
      data: {
        title,
        body: (sub ? sub + '｜' : '') + (left > 0 ? '還有 ' + left + ' 分鐘' : left > -2 ? '時間到了' : '已過 ' + (-left) + ' 分鐘') + '（' + time + '）',
        tag,
        url: '/Aethelgard/',
      },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    });
    sent[key] = now;
    await logRef.set({ sent });   // 送一則就記一則：中途出錯或被中斷時，下一輪不會重複發
    // 失效的 token（解除安裝、清除網站資料）順手清掉
    await Promise.all(res.responses.map((r, i) => {
      const c = r.error && r.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token')
        return ref.update({ ['tokens.' + devices[i][0] + '.t']: '' });
    }));
    console.log('sent', title, sub, res.successCount + '/' + devices.length);
  }

  if (jobs.length) {
    Object.keys(sent).forEach(k => { if (now - sent[k] > 3 * 864e5) delete sent[k]; });
    await logRef.set({ sent });
  }
})().catch(e => { console.error(e); process.exit(1); });
