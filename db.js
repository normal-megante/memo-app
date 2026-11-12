// IndexedDB の薄いラッパー
// DB 名 'mynote'。同じ github.io の他のアプリと名前がぶつからないようにしてある。
const DB = (() => {
  const VERSION = 2; // v2: 誕生日の棚（birthdays）を追加
  const STORES = ['notes', 'events', 'files', 'meta', 'birthdays'];
  // ここに入っている棚を書き換えたら「最後に変更した時刻」も記録する（バックアップのお知らせ用）
  const TRACK = ['notes', 'events', 'birthdays'];
  const TRACK_META = ['genres', 'vault'];
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('mynote', VERSION);
      // 新しい棚を足すときは VERSION を上げ、まだない棚だけを作る
      r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
      r.onsuccess = () => {
        const db = r.result;
        // 新しい版のアプリが別の画面で開かれたら、こちらは閉じて読み直す
        db.onversionchange = () => { db.close(); location.reload(); };
        res(db);
      };
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn, track) {
    const db = await open();
    const stores = track ? [store, 'meta'] : [store];
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      const req = fn(t.objectStore(store));
      if (track) t.objectStore('meta').put({ id: 'lastChange', v: Date.now() });
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    all: s => tx(s, 'readonly', o => o.getAll()),
    get: (s, id) => tx(s, 'readonly', o => o.get(id)),
    put: (s, v) => tx(s, 'readwrite', o => o.put(v), TRACK.includes(s) || (s === 'meta' && TRACK_META.includes(v.id))),
    del: (s, id) => tx(s, 'readwrite', o => o.delete(id), TRACK.includes(s)),
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    async getMeta(k, d) { const r = await this.get('meta', k); return r ? r.v : d; },
    setMeta(k, v) { return this.put('meta', { id: k, v }); },
  };
})();
