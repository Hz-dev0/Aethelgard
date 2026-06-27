const _swBuild = '202606270000'; // ← 每次部署手動改這個數字（或交由 CI 自動注入）
const CACHE_NAME = 'aethelgard-' + _swBuild;

const ASSETS = [
  '/Aethelgard/',
  '/Aethelgard/index.html',
  '/Aethelgard/manifest.json',
  '/Aethelgard/icon.png',
  '/Aethelgard/css/main.css',
  '/Aethelgard/js/early.js',
  '/Aethelgard/js/firebase-init.js',
  '/Aethelgard/js/firebase.js',
  '/Aethelgard/js/auth.js',
  '/Aethelgard/js/state.js',
  '/Aethelgard/js/tasks.js',
  '/Aethelgard/js/rewards.js',
  '/Aethelgard/js/sync.js',
  '/Aethelgard/js/notes.js',
  '/Aethelgard/js/routines.js',
  '/Aethelgard/js/calendar.js',
  '/Aethelgard/js/datepicker.js',
  '/Aethelgard/js/stats.js',
  '/Aethelgard/js/ui.js',
  '/Aethelgard/js/pwa.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }) // ★ 明確繞過瀏覽器 HTTP 快取，避免 network-first 被舊的 HTTP 快取回應擋下來
      .then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => caches.match(e.request))
  );
});
