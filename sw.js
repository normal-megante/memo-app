// オフラインでも開けるようにするしくみ（Service Worker）
// アプリのファイルを変えたら、C の番号を1つ上げる。
const C = 'mynote-v2';
const PRECACHE = [
  './', 'index.html', 'style.css', 'db.js', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())));
// 古い版のキャッシュを消す（同じ github.io の他のアプリのキャッシュは消さない）
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mynote-') && k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// ネットにつながれば最新を使い、つながらなければ保存しておいたものを使う
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { cacheName: C }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html', { cacheName: C }) : Response.error()))));
});
