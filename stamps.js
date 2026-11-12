// ひらめきスタンプの計算（画面や保存には触らない）
// スタンプ：{ 'YYYY-MM-DD': 1（済）| 2（金色＝⭐をつけたひらめきを書いた日） }
const ST = (() => {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isIdea = n => !!n && !!n.kind && n.kind !== 'memo';
  // そのひらめきで押されるスタンプ（書いた日と、1か2か）
  const stampOf = n => ({ day: ymd(new Date(n.created || n.updated)), v: n.star ? 2 : 1 });

  // 記録（log）と、今あるひらめきの両方からスタンプを作る。
  // 記録があるので、ひらめきを消してもその日のスタンプは残る。記録より前に書いたひらめきも数える。
  function merge(log, notes) {
    const days = { ...(log || {}) };
    for (const n of notes) if (isIdea(n)) { const s = stampOf(n); days[s.day] = Math.max(days[s.day] || 0, s.v); }
    return days;
  }
  // 記録に足す。変わったら新しい記録を、変わらなければ null を返す（下げることはしない）
  function add(log, n) {
    if (!isIdea(n)) return null;
    const s = stampOf(n);
    if ((log[s.day] || 0) >= s.v) return null;
    return { ...log, [s.day]: s.v };
  }
  // 連続日数。今日まだ書いていなくても、昨日まで続いていれば数える（今日書けば +1）
  function streak(days, today = new Date()) {
    const d = new Date(today); d.setHours(0, 0, 0, 0);
    const done = !!days[ymd(d)];
    if (!done) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return { n, today: done };
  }
  // y 年 m 月（1〜12）のスタンプの数と、そのうち金色の数
  function month(days, y, m) {
    const pre = `${y}-${pad(m)}-`;
    const vs = Object.entries(days).filter(([k]) => k.startsWith(pre)).map(([, v]) => v);
    return { count: vs.length, gold: vs.filter(v => v === 2).length };
  }
  return { ymd, isIdea, merge, add, streak, month };
})();
if (typeof module !== 'undefined') module.exports = ST;
