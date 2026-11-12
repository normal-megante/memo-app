'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLES = { memo: 'メモ', idea: 'ひらめき', cal: '予定', files: 'ファイル', vault: '金庫' };
const KINDS = { memo: 'メモ', question: '❓問い', curious: '👀気になる', link: '🔗つなぎ' };
const S = { tab: 'memo', genre: '', q: '', genres: [], pair: null, month: new Date(), sel: ymd(new Date()), vault: null };

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2200); }
// ---------- 下から出るシート ----------
// スマホの「戻る」でシートだけ閉じるよう、開くときに履歴を1つ積む。
// onLeave: 保存ボタン以外（外側タップ・戻る）で閉じるときに呼ぶ。false を返すと閉じない。
let sheetLeave = null, backPending = false, queuedOpen = null;
function openSheet(html, mount, onLeave) {
  if (backPending) { queuedOpen = [html, mount, onLeave]; return; }
  if ($('#sheet').hidden) history.pushState({ sheet: 1 }, '');
  sheetLeave = onLeave || null;
  $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('#sheetBody').scrollTop = 0; mount && mount($('#sheetBody'));
}
function hideSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; sheetLeave = null; stopVoice(); }
// force: 保存・削除ボタンなどから閉じるとき（onLeave を呼ばない）
function closeSheet(force) {
  if ($('#sheet').hidden) return;
  if (!force && sheetLeave && sheetLeave() === false) return;
  hideSheet();
  if (history.state && history.state.sheet) { backPending = true; history.back(); }
}
addEventListener('popstate', () => {
  if (backPending) { backPending = false; if (queuedOpen) { const q = queuedOpen; queuedOpen = null; openSheet(...q); } return; }
  if ($('#sheet').hidden) return;
  if (sheetLeave && sheetLeave() === false) { history.pushState({ sheet: 1 }, ''); return; }
  hideSheet();
});
if (history.state && history.state.sheet) history.replaceState(null, '');
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
async function copy(t) {
  try { await navigator.clipboard.writeText(t); }
  catch {
    // 古い方法でもう一度ためす
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
    if (!ok) return toast('コピーできませんでした');
  }
  toast('コピーしました');
}
function fmt(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('読み込み失敗(ネット接続が必要)')); document.head.appendChild(s); }); }

// ---------- 音声入力 ----------
let rec = null;
function stopVoice() { if (rec) { try { rec.stop(); } catch { } rec = null; } }
function toggleVoice(ta, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('このブラウザは音声入力に未対応です');
  if (rec) { stopVoice(); btn.textContent = '🎤 音声入力'; return; }
  rec = new SR(); rec.lang = 'ja-JP'; rec.continuous = true; rec.interimResults = false;
  rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) ta.value += e.results[i][0].transcript + '\n'; };
  rec.onend = () => { rec = null; btn.textContent = '🎤 音声入力'; };
  rec.onerror = e => toast('音声入力エラー: ' + e.error);
  rec.start(); btn.textContent = '⏹ 停止';
}

// ---------- 画面切替 ----------
async function render() {
  S.genres = await DB.getMeta('genres', ['日常', '仕事', 'アイデア', '買い物']);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#title').textContent = TITLES[S.tab];
  $('#fab').hidden = S.tab === 'vault' && !(S.vault && S.vault.key);
  await ({ memo: rMemo, idea: rIdea, cal: rCal, files: rFiles, vault: rVault })[S.tab]();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.tab = b.dataset.tab; render(); } });
$('#fab').addEventListener('click', () => ({ memo: () => editNote(), idea: () => editNote(null, 'question'), cal: () => editEvent(), files: pickFiles, vault: () => editCred() })[S.tab]());
$('#menuBtn').addEventListener('click', menu);

// ---------- メモ ----------
function noteCard(n) {
  const links = (n.links || []).length ? ' 🔗' : '';
  const meta = [n.kind !== 'memo' ? KINDS[n.kind] : '', esc(n.genre || ''), fmt(n.updated)].filter(Boolean).join(' · ');
  return `<div class="card" data-id="${n.id}"><h3>${n.pinned ? '📌 ' : ''}${esc(n.title || '(無題)')}</h3><p>${esc(n.body)}</p><div class="meta">${meta}${links}</div></div>`;
}
function bindCards(root, list) { $$('.card[data-id]', root).forEach(c => c.onclick = () => editNote(list.find(n => n.id === c.dataset.id))); }
async function rMemo() {
  const all = (await DB.all('notes')).filter(n => n.kind === 'memo');
  $('#view').innerHTML = `${await backupBanner(all.length)}<input id="q" type="search" placeholder="🔍 検索" value="${esc(S.q)}">
  <div class="chips"><button class="chip ${S.genre ? '' : 'on'}" data-g="">すべて</button>${S.genres.map(g => `<button class="chip ${S.genre === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}<button class="chip" id="addG">＋</button></div>
  <div id="list"></div>`;
  // 検索欄そのものは描き直さない（描き直すと日本語の変換中の文字が消えてしまうため）
  const draw = () => {
    const q = S.q.toLowerCase();
    const list = all.filter(n => (!S.genre || n.genre === S.genre) && (!q || (n.title + n.body).toLowerCase().includes(q)))
      .sort((a, b) => (b.pinned | 0) - (a.pinned | 0) || b.updated - a.updated);
    $('#list').innerHTML = list.map(noteCard).join('') || `<div class="empty">${all.length ? '見つかりませんでした' : 'メモがまだありません\n右下の＋で追加'}</div>`;
    bindCards($('#list'), list);
  };
  $('#q').oninput = e => { S.q = e.target.value; draw(); };
  $$('.chip[data-g]').forEach(c => c.onclick = () => { S.genre = c.dataset.g; render(); });
  $('#addG').onclick = addGenre;
  bindBackupBanner();
  draw();
}
async function addGenre() {
  const n = prompt('新しいジャンル名'); if (!n || !n.trim()) return;
  if (!S.genres.includes(n.trim())) await DB.setMeta('genres', [...S.genres, n.trim()]);
  render();
}
async function editNote(n, kind) {
  const isNew = !n;
  n = n || { id: DB.uid(), title: '', body: '', genre: S.genre || '', kind: kind || 'memo', pinned: false, links: [], created: Date.now() };
  const all = await DB.all('notes');
  const linked = (n.links || []).map(id => all.find(x => x.id === id)).filter(Boolean);
  let leave = () => { };
  openSheet(`<h2>${isNew ? '新規' : '編集'}</h2>
  <select id="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${n.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  <input id="t" placeholder="タイトル" value="${esc(n.title)}">
  <select id="g"><option value="">ジャンルなし</option>${S.genres.map(g => `<option ${n.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
  <textarea id="b" placeholder="内容">${esc(n.body)}</textarea>
  ${linked.length ? `<div class="sub">つながり: ${linked.map(x => esc(x.title || '(無題)')).join(' / ')}</div>` : ''}
  <button class="btn" id="save">保存</button><button class="btn ghost" id="mic">🎤 音声入力</button>
  <button class="btn ghost" id="pin">${n.pinned ? '📌 固定解除' : '📌 固定'}</button>
  <button class="btn ghost" id="ask">Claude用にコピー</button>
  ${isNew ? '' : '<button class="btn danger" id="del">削除</button>'}
  <p class="hint">保存ボタンを押さずに閉じても（外側をタップ・戻る）、自動で保存します。</p>`, r => {
    let pinned = !!n.pinned;
    const now = () => ({ kind: $('#kind', r).value, title: $('#t', r).value.trim(), body: $('#b', r).value, genre: $('#g', r).value, pinned });
    const start = JSON.stringify(now());
    const save = async () => {
      const v = now();
      if (!v.title && !v.body) return false;
      Object.assign(n, v, { updated: Date.now() });
      await DB.put('notes', n);
      return true;
    };
    // 外側タップ・戻るで閉じたとき：変更があれば自動保存
    leave = () => { if (JSON.stringify(now()) !== start) save().then(ok => { if (ok) { toast('自動で保存しました'); render(); } }); };
    $('#mic', r).onclick = e => toggleVoice($('#b', r), e.target);
    $('#pin', r).onclick = e => { pinned = !pinned; e.target.textContent = pinned ? '📌 固定解除' : '📌 固定'; toast(pinned ? '一覧の上に固定します' : '固定を解除します'); };
    $('#ask', r).onclick = () => copy(`次のメモについて、深掘りする問いや関連しそうな視点を教えてください。\n\n【${$('#t', r).value}】\n${$('#b', r).value}`);
    $('#save', r).onclick = async () => {
      if (!(await save())) return toast('空のままです');
      closeSheet(true); render();
    };
    const d = $('#del', r); if (d) d.onclick = async () => { if (confirm('削除しますか？')) { await DB.del('notes', n.id); closeSheet(true); render(); } };
  }, () => leave());
}

// ---------- ひらめき ----------
async function rIdea() {
  const all = await DB.all('notes');
  const ideas = all.filter(n => n.kind !== 'memo').sort((a, b) => b.updated - a.updated);
  const p = S.pair && S.pair.map(id => all.find(n => n.id === id));
  const pairOk = p && p.every(Boolean);
  $('#view').innerHTML = `<div class="card"><h3>🎲 ランダム2つ → 共通点は？</h3>
  <p class="sub" style="-webkit-line-clamp:unset">メモやひらめきから2つ選びます。つながりを考えて書き足そう。</p><div style="height:8px"></div>
  ${pairOk ? `<div class="pair">${p.map(n => `<div class="card"><b>${esc(n.title || '(無題)')}</b><div class="sub">${esc((n.body || '').slice(0, 60))}</div></div>`).join('')}</div>
  <div style="height:8px"></div><textarea id="common" placeholder="共通点・つながりは？（例: あの目元と関係ありそう）" style="min-height:90px"></textarea>
  <button class="btn" id="saveLink">つなぎとして保存</button><button class="btn ghost" id="askC">Claudeに聞く用コピー</button>` : ''}
  <button class="btn ${pairOk ? 'ghost' : ''}" id="roll">${pairOk ? 'もう一度ふる' : 'ふる'}</button></div>
  <h3 style="margin:14px 0 8px">問い・気になること・つなぎ</h3>
  ${ideas.map(noteCard).join('') || '<div class="empty">右下の＋で「問い」を書いてみよう</div>'}`;
  $('#roll').onclick = () => {
    if (all.length < 2) return toast('メモが2つ以上必要です');
    const a = [...all].sort(() => Math.random() - .5).slice(0, 2); S.pair = a.map(x => x.id); rIdea();
  };
  if (pairOk) {
    $('#saveLink').onclick = async () => {
      const t = $('#common').value.trim(); if (!t) return toast('つながりを書いてください');
      await DB.put('notes', { id: DB.uid(), kind: 'link', title: `${p[0].title || '無題'} × ${p[1].title || '無題'}`, body: t, genre: 'アイデア', links: p.map(x => x.id), pinned: false, created: Date.now(), updated: Date.now() });
      S.pair = null; toast('保存しました'); render();
    };
    $('#askC').onclick = () => copy(`次の2つに意外な共通点やつながりを5つ挙げてください。\n\nA: ${p[0].title}\n${p[0].body}\n\nB: ${p[1].title}\n${p[1].body}`);
  }
  bindCards($('#view'), ideas);
}

// ---------- カレンダー ----------
async function rCal() {
  const evs = await DB.all('events');
  const y = S.month.getFullYear(), m = S.month.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), today = ymd(new Date());
  let cells = ['日', '月', '火', '水', '木', '金', '土'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells += `<button class="d ${key === today ? 'today' : ''} ${key === S.sel ? 'sel' : ''}" data-d="${key}">${d}<span class="dot">${evs.some(e => e.date === key) ? '●' : ''}</span></button>`;
  }
  const day = evs.filter(e => e.date === S.sel).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  $('#view').innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn ghost" id="pm">◀</button><b>${y}年${m + 1}月</b><button class="btn ghost" id="nm">▶</button></div>
  <div class="cal">${cells}</div><h3 style="margin:14px 0 8px">${S.sel}</h3>
  ${day.map(e => `<div class="card" data-e="${e.id}"><h3>${esc(e.time || '')} ${esc(e.title)}</h3><p>${esc(e.memo)}</p></div>`).join('') || '<div class="empty" style="margin-top:12px">予定なし</div>'}`;
  $('#pm').onclick = () => { S.month = new Date(y, m - 1, 1); rCal(); };
  $('#nm').onclick = () => { S.month = new Date(y, m + 1, 1); rCal(); };
  $$('.d').forEach(b => b.onclick = () => { S.sel = b.dataset.d; rCal(); });
  $$('[data-e]').forEach(c => c.onclick = () => editEvent(evs.find(e => e.id === c.dataset.e)));
}
function editEvent(ev) {
  const isNew = !ev; ev = ev || { id: DB.uid(), date: S.sel, time: '', title: '', memo: '' };
  let leave = () => true;
  openSheet(`<h2>予定</h2><input type="date" id="d" value="${ev.date}"><input type="time" id="tm" value="${ev.time}">
  <input id="t" placeholder="タイトル" value="${esc(ev.title)}"><textarea id="m" placeholder="メモ" style="min-height:90px">${esc(ev.memo)}</textarea>
  <button class="btn" id="save">保存</button>${isNew ? '' : '<button class="btn danger" id="del">削除</button>'}`, r => {
    const now = () => [$('#d', r).value, $('#tm', r).value, $('#t', r).value, $('#m', r).value].join('\n');
    const start = now();
    leave = () => now() === start || confirm('保存していない変更があります。保存せずに閉じますか？');
    $('#save', r).onclick = async () => {
      if (!$('#t', r).value.trim()) return toast('タイトルを入力');
      if (!$('#d', r).value) return toast('日付を入力');
      Object.assign(ev, { date: $('#d', r).value, time: $('#tm', r).value, title: $('#t', r).value.trim(), memo: $('#m', r).value, updated: Date.now() });
      await DB.put('events', ev); S.sel = ev.date; closeSheet(true); render();
    };
    const d = $('#del', r); if (d) d.onclick = async () => { if (confirm('この予定を削除しますか？')) { await DB.del('events', ev.id); closeSheet(true); render(); } };
  }, () => leave());
}

// ---------- ファイル ----------
const ICON = t => t.startsWith('audio') ? '🎵' : t.includes('pdf') ? '📄' : t.startsWith('video') ? '🎬' : '📎';
const urls = [];
async function rFiles() {
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  const fs = (await DB.all('files')).sort((a, b) => b.added - a.added);
  $('#view').innerHTML = `<p class="sub">＋でスマホ内の画像・PDF・音声を取り込むと、ここからすぐ見られます（アプリ内にコピー保存）。</p>
  <p class="hint">※ ここのファイルはバックアップに入りません。元のファイルは消さずに残しておいてください。</p>
  <div class="grid">${fs.map(f => {
    let th; if (f.type.startsWith('image')) { const u = URL.createObjectURL(f.blob); urls.push(u); th = `<img class="thumb" src="${u}">`; } else th = `<div class="fileico">${ICON(f.type)}</div>`;
    return `<div class="it" data-f="${f.id}">${th}${esc(f.name)}</div>`;
  }).join('')}</div>${fs.length ? '' : '<div class="empty">ファイルがありません</div>'}`;
  $$('[data-f]').forEach(c => c.onclick = () => viewFile(fs.find(f => f.id === c.dataset.f)));
}
function pickFiles() {
  const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*,application/pdf,audio/*,video/*,text/*';
  i.onchange = async () => { for (const f of i.files) await DB.put('files', { id: DB.uid(), name: f.name, type: f.type || 'application/octet-stream', blob: f, added: Date.now() }); toast(`${i.files.length}件 取り込みました`); render(); };
  i.click();
}
async function pdfToCanvases(blob, el, maxPages) {
  if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1.6 });
    const c = document.createElement('canvas'); c.className = 'pdfp'; c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    el && el.appendChild(c); out.push(c);
  }
  return { canvases: out, total: pdf.numPages };
}
function viewFile(f) {
  const isImg = f.type.startsWith('image'), isPdf = f.type.includes('pdf');
  const u = URL.createObjectURL(f.blob); urls.push(u);
  const body = isImg ? `<img class="full" src="${u}">` : isPdf ? '<div id="pdf" class="sub">読み込み中…</div>' : f.type.startsWith('audio') ? `<audio controls src="${u}" style="width:100%"></audio>` : f.type.startsWith('video') ? `<video controls src="${u}" style="width:100%"></video>` : `<a href="${u}" download="${esc(f.name)}">ダウンロード</a>`;
  openSheet(`<h2>${esc(f.name)}</h2>${body}<div style="height:10px"></div>
  ${isImg || isPdf ? '<button class="btn" id="ocr">📝 文字起こし(OCR)</button>' : ''}<button class="btn danger" id="del">削除</button>
  <div id="stat" class="sub"></div><textarea id="out" hidden></textarea><button class="btn" id="toNote" hidden>メモに保存</button>
  ${f.type.startsWith('audio') ? '<p class="sub">音声ファイルの文字起こしは、このアプリ単体では未対応です（メモ編集の「🎤音声入力」はマイクから直接の聞き取り）。</p>' : ''}`, async r => {
    $('#del', r).onclick = async () => { if (confirm('このファイルを削除しますか？')) { await DB.del('files', f.id); closeSheet(); render(); } };
    if (isPdf) try { const el = $('#pdf', r); el.textContent = ''; const { total } = await pdfToCanvases(f.blob, el, 30); if (total > 30) el.insertAdjacentHTML('beforeend', `<p class="sub">先頭30/${total}ページを表示</p>`); } catch (e) { $('#pdf', r).textContent = 'PDFを表示できません: ' + e.message; }
    const ocr = $('#ocr', r); if (ocr) ocr.onclick = async () => {
      const st = $('#stat', r); ocr.disabled = true;
      try {
        st.textContent = 'OCRエンジン読み込み中（初回はネット接続と少し時間が必要）…';
        if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
        let targets = [f.blob];
        if (isPdf) targets = (await pdfToCanvases(f.blob, null, 5)).canvases;
        let text = '';
        for (let i = 0; i < targets.length; i++) {
          const { data } = await Tesseract.recognize(targets[i], 'jpn+eng', { logger: m => { if (m.status) st.textContent = `${i + 1}/${targets.length} ${m.status} ${Math.round((m.progress || 0) * 100)}%`; } });
          text += data.text.trim() + '\n\n';
        }
        const o = $('#out', r); o.value = text.trim(); o.hidden = false; $('#toNote', r).hidden = false; st.textContent = '完了' + (isPdf ? '（先頭5ページ）' : '');
      } catch (e) { st.textContent = '失敗: ' + e.message; }
      ocr.disabled = false;
    };
    $('#toNote', r).onclick = async () => {
      await DB.put('notes', { id: DB.uid(), kind: 'memo', title: f.name + ' の文字起こし', body: $('#out', r).value, genre: '', links: [], pinned: false, created: Date.now(), updated: Date.now() });
      toast('メモに保存しました'); closeSheet(); S.tab = 'memo'; render();
    };
  });
}

// ---------- 金庫(パスワード等) ----------
const b64 = u => { let s = ''; u = new Uint8Array(u); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pw, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function vaultSave() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, S.vault.key, new TextEncoder().encode(JSON.stringify(S.vault.items)));
  await DB.setMeta('vault', { salt: b64(S.vault.salt), iv: b64(iv), data: b64(data) });
}
function lockVault() { S.vault = null; }
let lockTimer;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lockTimer = setTimeout(() => { lockVault(); if (S.tab === 'vault') render(); }, 60000); else clearTimeout(lockTimer);
});
async function rVault() {
  const meta = await DB.getMeta('vault', null);
  const v = $('#view');
  if (S.vault && S.vault.key) {
    const items = S.vault.items;
    v.innerHTML = `<div class="row"><span class="sub">🔓 ロック解除中（画面を離れて1分で自動ロック）</span><button class="btn ghost" id="lock">ロック</button></div>
    ${items.map(c => `<div class="card" data-c="${c.id}"><h3>${esc(c.title)}</h3><div class="meta">${esc(c.user)}</div></div>`).join('') || '<div class="empty">右下の＋で追加\nパスワード・会員番号・暗証メモなど</div>'}`;
    $('#lock').onclick = () => { lockVault(); render(); };
    $$('[data-c]').forEach(c => c.onclick = () => editCred(items.find(x => x.id === c.dataset.c)));
    return;
  }
  v.innerHTML = meta ? `<div class="card"><h3>🔒 ロック中</h3><input id="pw" type="password" placeholder="マスターパスワード" autocomplete="off"><button class="btn" id="go">開く</button></div>`
    : `<div class="card"><h3>金庫をつくる</h3><p class="sub" style="-webkit-line-clamp:unset">マスターパスワードで暗号化して端末内に保存します。<b>忘れると復元できません。</b></p><div style="height:8px"></div>
    <input id="pw" type="password" placeholder="マスターパスワード" autocomplete="off"><input id="pw2" type="password" placeholder="もう一度" autocomplete="off"><button class="btn" id="go">作成</button></div>`;
  $('#go').onclick = async () => {
    const pw = $('#pw').value; if (!pw) return;
    if (meta) {
      try {
        const salt = unb64(meta.salt), key = await deriveKey(pw, salt);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(meta.iv) }, key, unb64(meta.data));
        S.vault = { key, salt, items: JSON.parse(new TextDecoder().decode(plain)) };
      } catch { return toast('パスワードが違います'); }
    } else {
      if (pw.length < 6) return toast('6文字以上にしてください');
      if (pw !== $('#pw2').value) return toast('確認と一致しません');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      S.vault = { key: await deriveKey(pw, salt), salt, items: [] }; await vaultSave();
    }
    render();
  };
}
function genPw() { const cs = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'; return [...crypto.getRandomValues(new Uint8Array(16))].map(n => cs[n % cs.length]).join(''); }
function editCred(c) {
  if (!S.vault || !S.vault.key) return;
  const isNew = !c; c = c || { id: DB.uid(), title: '', user: '', pass: '', url: '', memo: '' };
  let leave = () => true;
  openSheet(`<h2>金庫の項目</h2><input id="t" placeholder="名前（例: Amazon）" value="${esc(c.title)}"><input id="u" placeholder="ID / ユーザー名" value="${esc(c.user)}" autocomplete="off">
  <input id="p" type="password" placeholder="パスワード" value="${esc(c.pass)}" autocomplete="off">
  <button class="btn ghost" id="show">表示</button><button class="btn ghost" id="cp">コピー</button><button class="btn ghost" id="gen">自動生成</button>
  <input id="url" placeholder="URL" value="${esc(c.url)}"><textarea id="m" placeholder="メモ" style="min-height:90px">${esc(c.memo)}</textarea>
  <button class="btn" id="save">保存</button>${isNew ? '' : '<button class="btn danger" id="del">削除</button>'}`, r => {
    const now = () => ['#t', '#u', '#p', '#url', '#m'].map(s => $(s, r).value).join('\n');
    const start = now();
    leave = () => now() === start || confirm('保存していない変更があります。保存せずに閉じますか？');
    $('#show', r).onclick = () => { const p = $('#p', r); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('#cp', r).onclick = () => copy($('#p', r).value);
    $('#gen', r).onclick = () => { const p = $('#p', r); p.value = genPw(); p.type = 'text'; };
    $('#save', r).onclick = async () => {
      if (!$('#t', r).value.trim()) return toast('名前を入力');
      Object.assign(c, { title: $('#t', r).value.trim(), user: $('#u', r).value, pass: $('#p', r).value, url: $('#url', r).value, memo: $('#m', r).value });
      if (isNew) S.vault.items.push(c);
      await vaultSave(); closeSheet(true); render();
    };
    const d = $('#del', r); if (d) d.onclick = async () => { if (confirm('削除しますか？')) { S.vault.items = S.vault.items.filter(x => x.id !== c.id); await vaultSave(); closeSheet(true); render(); } };
  }, () => leave());
}

// ---------- バックアップ ----------
const DAY = 864e5;
function ago(ts) { const d = Math.floor((Date.now() - ts) / DAY); return d <= 0 ? '今日' : `${d}日前`; }
async function backupData() {
  return { app: 'mynote', v: 1, exportedAt: new Date().toISOString(), notes: await DB.all('notes'), events: await DB.all('events'), genres: S.genres, vault: await DB.getMeta('vault', null) };
}
// how: 'share'（共有 → Google ドライブなど）／'file'（スマホのダウンロードフォルダへ）
async function doBackup(how) {
  const json = JSON.stringify(await backupData());
  const name = `mynote-backup-${ymd(new Date())}`;
  if (how === 'share') {
    // Chrome の共有は .json を受け付けないので .txt で送る（中身は同じ。戻すときはどちらでも読める）
    const file = new File([json], name + '.txt', { type: 'text/plain' });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) { toast('この端末では共有できません。「ファイルに保存」を使ってください'); return false; }
    try { await navigator.share({ files: [file], title: 'マイノートのバックアップ' }); }
    catch (e) { if (e.name !== 'AbortError') toast('共有できませんでした'); return false; }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name + '.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  await DB.setMeta('lastBackup', Date.now());
  toast('バックアップしました');
  return true;
}
function restoreBackup() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.txt,application/json,text/plain';
  i.onchange = async () => {
    let d;
    try { d = JSON.parse(await i.files[0].text()); } catch { return toast('このファイルは読み込めませんでした'); }
    if (!d || !Array.isArray(d.notes)) return toast('マイノートのバックアップではないようです');
    const when = d.exportedAt ? `（${fmt(Date.parse(d.exportedAt))} のバックアップ）` : '';
    if (!confirm(`メモ・ひらめき ${d.notes.length}件、予定 ${(d.events || []).length}件を読み込みます${when}。\n今あるメモは消えません（同じメモはバックアップの内容になります）。続けますか？`)) return;
    for (const n of d.notes) await DB.put('notes', n);
    for (const e of d.events || []) await DB.put('events', e);
    if (d.genres) await DB.setMeta('genres', [...new Set([...S.genres, ...d.genres])]);
    if (d.vault && confirm('金庫も読み込みますか？（今の金庫は、バックアップの金庫に置き換わります）')) await DB.setMeta('vault', d.vault);
    lockVault(); closeSheet(); toast('読み込みました'); render();
  };
  i.click();
}
// メモタブのいちばん上に出す「そろそろバックアップ」のお知らせ
async function backupBanner(count) {
  if (!count) return '';
  const last = await DB.getMeta('lastBackup', 0), change = await DB.getMeta('lastChange', 1), snooze = await DB.getMeta('backupSnooze', 0);
  if (change <= last || Date.now() < snooze) return '';   // バックアップのあと変更なし／「あとで」を押した
  if (last && Date.now() - last < 7 * DAY) return '';      // 1週間以内にバックアップ済み
  return `<div class="card notice"><b>💾 ${last ? `最後のバックアップから${Math.floor((Date.now() - last) / DAY)}日たちました` : 'まだバックアップしていません'}</b>
  <div class="sub">メモはこのスマホの中だけにあります。Googleドライブに保存しておくと、スマホをなくしても戻せます。</div>
  <div style="height:8px"></div><button class="btn" data-bk="share">📤 Googleドライブなどに保存</button><button class="btn ghost" data-bk="later">あとで</button></div>`;
}
function bindBackupBanner() {
  const s = $('[data-bk="share"]'); if (!s) return;
  s.onclick = async () => { if (await doBackup('share')) render(); };
  $('[data-bk="later"]').onclick = async () => { await DB.setMeta('backupSnooze', Date.now() + 3 * DAY); render(); };
}

// ---------- メニュー: バックアップ・ジャンル管理 ----------
async function menu() {
  const last = await DB.getMeta('lastBackup', 0);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  openSheet(`<h2>メニュー</h2>
  <h3>💾 バックアップ</h3>
  <p class="sub">メモはこのスマホの中だけに保存されています（ネットには送っていません）。機種変更・故障・Chromeの「サイトデータを削除」で消えてしまうので、ときどきバックアップしてください。</p>
  <p class="sub">最後のバックアップ：<b>${last ? `${fmt(last)}（${ago(last)}）` : 'まだありません'}</b></p>
  <button class="btn" id="bkShare">📤 共有して保存</button>
  <p class="hint">出てきた一覧から「ドライブ」を選ぶと Google ドライブに保存できます。スマホをなくしても、そこから戻せます。</p>
  <button class="btn ghost" id="bkFile">⬇ ファイルに保存</button>
  <p class="hint">スマホの「ダウンロード」フォルダに保存されます（スマホが壊れると一緒に消えます）。</p>
  <p class="hint">入るもの：メモ・ひらめき・予定・ジャンル・金庫（暗号化したまま）。<b>ファイルタブの画像・PDFなどは入りません。</b></p>
  <button class="btn ghost" id="bkRestore">📥 バックアップから戻す</button>
  <p class="hint">今あるメモは消えません。同じメモは、バックアップのときの内容に戻ります。</p>
  <h3>🛡 消されにくくする設定</h3>
  <p class="sub">いまの状態：<b>${persisted ? 'オン ✅' : 'オフ'}</b></p>
  <p class="hint">スマホの空きが少なくなったときに、Chrome がデータを勝手に消さないようにする設定です。ホーム画面に追加して使うと、たいてい自動でオンになります。自分で「サイトデータを削除」したときは、オンでも消えます。</p>
  <p class="hint">⚠️ 単語帳・計算機など、同じ住所（github.io）のアプリと保存場所が共通です。Chrome でこのサイトのデータを削除すると、全部のアプリのデータが消えます。</p>
  <h3>🏷 ジャンル</h3>${S.genres.map(g => `<span class="chip" data-del="${esc(g)}">${esc(g)} ✕</span>`).join('')}
  <p class="hint">✕ で一覧から消せます（そのジャンルのメモは消えません）。</p>`, r => {
    $('#bkShare', r).onclick = async () => { if (await doBackup('share')) { closeSheet(); render(); } };
    $('#bkFile', r).onclick = async () => { if (await doBackup('file')) { closeSheet(); render(); } };
    $('#bkRestore', r).onclick = restoreBackup;
    $$('[data-del]', r).forEach(c => c.onclick = async () => { if (confirm(`ジャンル「${c.dataset.del}」を一覧から削除？（メモは消えません）`)) { await DB.setMeta('genres', S.genres.filter(g => g !== c.dataset.del)); closeSheet(); render(); } });
  });
}

// 空き容量が少ないときに Chrome がデータを消さないようお願いする（ホーム画面に追加していると、たいてい通る）
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
render();
