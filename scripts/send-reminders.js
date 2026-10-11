// 由 GitHub Actions 每 5 分鐘執行：找出「快到期」的任務，推播到已開啟通知的手機。
// 需要 repo secret：FIREBASE_SERVICE_ACCOUNT（Firebase 服務帳戶金鑰的整份 JSON）
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const GRACE = 30 * 6e4;   // 排程延遲時，最晚還能補發到到期後 30 分鐘

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

  const jobs = [];
  for (const t of S.tasks || []) {
    if (t.done || !t.date || !t.time) continue;
    if ((t.rm === undefined ? def : t.rm) === 0) continue;
    const due = Date.parse(t.date + 'T' + t.time + ':00Z') - tzo * 6e4;
    if (!(now >= due - lead && now <= due + GRACE)) continue;
    const key = t.id + '|' + t.date + '|' + t.time + '|' + lead;
    if (sent[key]) continue;
    jobs.push({ t, due, key });
  }

  for (const { t, due, key } of jobs) {
    const left = Math.round((due - now) / 6e4);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: devices.map(([, v]) => v.t),
      data: {
        title: t.name,
        body: (left > 0 ? '還有 ' + left + ' 分鐘' : '時間到了') + '（' + t.time + '）',
        tag: 't-' + t.id + '-' + t.date + '-' + t.time,
        url: '/Aethelgard/',
      },
      webpush: { headers: { Urgency: 'high', TTL: '1800' } },
    });
    sent[key] = now;
    // 失效的 token（解除安裝、清除網站資料）順手清掉
    await Promise.all(res.responses.map((r, i) => {
      const c = r.error && r.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token')
        return ref.update({ ['tokens.' + devices[i][0] + '.t']: '' });
    }));
    console.log('sent', t.name, res.successCount + '/' + devices.length);
  }

  if (jobs.length) {
    Object.keys(sent).forEach(k => { if (now - sent[k] > 3 * 864e5) delete sent[k]; });
    await logRef.set({ sent });
  }
})().catch(e => { console.error(e); process.exit(1); });
