// オフラインでも開けるようにするしくみ（Service Worker）と、誕生日の通知
// アプリのファイルを変えたら、C の番号を1つ上げる。
importScripts('birthday.js');
const C = 'mynote-v5';
const PRECACHE = [
  './', 'index.html', 'style.css', 'db.js', 'birthday.js', 'stamps.js', 'app.js', 'manifest.webmanifest',
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

// ---------- 誕生日の通知 ----------
// Chrome が1日1回くらい（ホーム画面に追加したアプリだけ）起こしてくれるので、そのときに確認する
self.addEventListener('periodicsync', e => { if (e.tag === 'birthday-check') e.waitUntil(checkBirthdays(false)); });
// 動作確認用：アプリから {type:'bd-dry-run'} を送ると、通知は出さずに「出すはずのもの」を返す
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'bd-dry-run') e.waitUntil(checkBirthdays(true).then(items => e.source && e.source.postMessage({ type: 'bd-dry-run', items })));
});
// DB を開く（まだ DB がなければ、作らずに null）
function openDB() {
  return new Promise(res => {
    const r = indexedDB.open('mynote');
    r.onupgradeneeded = () => r.transaction.abort();
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
}
function req(db, store, key) {
  return new Promise((res, rej) => {
    const os = db.transaction(store).objectStore(store);
    const q = key === undefined ? os.getAll() : os.get(key);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function checkBirthdays(dry) {
  if (!dry && Notification.permission !== 'granted') return [];
  const db = await openDB(); if (!db) return [];
  try {
    if (!db.objectStoreNames.contains('birthdays')) return [];
    const meta = async k => { const r = await req(db, 'meta', k); return r ? r.v : undefined; };
    if (!dry && !(await meta('bdNotify'))) return [];
    const list = await req(db, 'birthdays');
    const days = (await meta('bdDays')) ?? 7;
    const notified = (await meta('bdNotified')) || {};
    const now = new Date(), quiet = now.getHours() < 7 || now.getHours() >= 22;
    const items = BD.due(list, days, notified, now);
    if (dry) return items.map(it => BD.message(it.b, it.n).title);
    for (const it of items) {
      const m = BD.message(it.b, it.n);
      await self.registration.showNotification(m.title, { body: m.body, icon: 'icons/icon-192.png', tag: 'bd-' + it.b.id, silent: quiet });
      notified[it.key] = Date.now();
    }
    await new Promise((res, rej) => {
      const t = db.transaction('meta', 'readwrite');
      t.objectStore('meta').put({ id: 'bdNotified', v: BD.prune(notified, now) });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    return items.map(it => BD.message(it.b, it.n).title);
  } finally { db.close(); }
}
// 通知をタップしたら、アプリの誕生日タブを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open-tab', tab: 'bd' }); return c.focus(); }
    return self.clients.openWindow(self.registration.scope + '#bd');
  }));
});
