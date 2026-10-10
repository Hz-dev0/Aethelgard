const _swBuild = '202610101141'; // ← 由 .github/workflows/bump-sw-version.yml 每次 push 自動更新，不用手動跑腳本
const CACHE_NAME = 'aethelgard-' + _swBuild;

const ASSETS = [
  '/Aethelgard/',
  '/Aethelgard/index.html',
  '/Aethelgard/manifest.json',
  '/Aethelgard/icon.png',
  '/Aethelgard/css/main.css',
  '/Aethelgard/css/todo.css',
  '/Aethelgard/js/early.js',
  '/Aethelgard/js/offline.js',
  '/Aethelgard/js/firebase-init.js',
  '/Aethelgard/js/firebase.js',
  '/Aethelgard/js/auth.js',
  '/Aethelgard/js/state.js',
  '/Aethelgard/js/core.js',
  '/Aethelgard/js/sync.js',
  '/Aethelgard/js/notes.js',
  '/Aethelgard/js/todo.js',
  '/Aethelgard/js/pwa.js',
];

// ── 外部資源快取（Firebase SDK、marked、DOMPurify、字體）──
// ★ 這些檔案在別的網域，原本的 fetch 處理會直接略過，導致「沒網路時冷啟動」時
//   Firebase SDK 載不進來、畫面卡在「正在驗證身份…」。這裡獨立一個快取，
//   版本更新時不會被清掉（見 activate）。
const EXT_CACHE = 'aethelgard-ext-v1';
const EXT_HOSTS = ['www.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'];
// 網址裡有固定版本號、內容不會變的主機：快取有就直接用，不再背景重抓
const EXT_IMMUTABLE = ['www.gstatic.com', 'fonts.gstatic.com'];
const EXT_PRECACHE = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js',
];
const NET_TIMEOUT_MS = 5000;   // 網路超過這麼久沒回應、而且本機有快取，就先用快取（訊號有但沒資料的情況）

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)),
    // 盡力預載，失敗（例如安裝時剛好沒網路）也不影響安裝；之後實際載入時會自動補進快取
    caches.open(EXT_CACHE).then(cache => Promise.all(EXT_PRECACHE.map(u =>
      fetch(u, { mode: 'cors' }).then(r => { if (r.ok) return cache.put(u, r); }).catch(() => {})
    ))),
  ]));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== EXT_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function extFetch(e) {
  const req = e.request, url = new URL(req.url);
  const cache = await caches.open(EXT_CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) {
    if (!EXT_IMMUTABLE.includes(url.hostname)) e.waitUntil(net);   // 可能會變的（CSS、marked）背景更新
    return hit;
  }
  return (await net) || Response.error();
}

function ownFetch(e) {
  const req = e.request;
  const net = fetch(req, { cache: 'no-store' }) // ★ 明確繞過瀏覽器 HTTP 快取，避免 network-first 被舊的 HTTP 快取回應擋下來
    .then(res => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(req, copy)));
      }
      return res;
    });
  const fallback = async () =>
    (await caches.match(req)) ||
    (await caches.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' ? (await caches.match('/Aethelgard/index.html')) || (await caches.match('/Aethelgard/')) : undefined);
  // 網路太慢（有訊號但沒資料）時，不要讓使用者等到天荒地老：超過時間且有快取就先用快取
  const timer = new Promise(resolve => setTimeout(() => resolve(fallback()), NET_TIMEOUT_MS));
  return Promise.race([net.catch(() => null), timer])
    .then(r => r || net.catch(async () => (await fallback()) || Response.error()));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // www.gstatic.com 只處理 Firebase SDK（有固定版本號的路徑），其他不碰
  if (EXT_HOSTS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(extFetch(e)); return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(ownFetch(e));
});
