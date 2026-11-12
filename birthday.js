// 誕生日の計算（アプリ本体と sw.js の両方から使う。画面や保存には触らない）
// 誕生日のデータ：{ id, name, month: 1〜12, day: 1〜31, year: 生まれた年 or null, memo }
const BD = (() => {
  const DAY = 864e5;
  const WEEK = '日月火水木金土';
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  // その月に選べる日の数（2月は29日まで選べる）
  const daysInMonth = m => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const midnight = t => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x; };
  // y 年の誕生日の日付。2月29日生まれは、うるう年以外は2月28日にする
  function dateIn(y, m, d) { if (m === 2 && d === 29 && !isLeap(y)) d = 28; return new Date(y, m - 1, d); }

  // 次の誕生日：{ date, days: あと何日（今日なら0）, age: その日に何歳になるか（年がなければ null） }
  function next(b, today = new Date()) {
    const t = midnight(today);
    let date = dateIn(t.getFullYear(), b.month, b.day);
    if (date < t) date = dateIn(t.getFullYear() + 1, b.month, b.day);
    return { date, days: Math.round((date - t) / DAY), age: b.year ? date.getFullYear() - b.year : null };
  }
  // いま何歳か（年がなければ null）
  function ageNow(b, today = new Date()) {
    if (!b.year) return null;
    const t = midnight(today);
    return t.getFullYear() - b.year - (t < dateIn(t.getFullYear(), b.month, b.day) ? 1 : 0);
  }
  // 4月15日(水)
  const label = d => `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
  // 和暦（例：平成10年）。わからない古い年は ''
  function wareki(y, m, d) {
    const t = y * 10000 + m * 100 + d;
    const era = [[20190501, '令和', 2018], [19890108, '平成', 1988], [19261225, '昭和', 1925], [19120730, '大正', 1911]].find(e => t >= e[0]);
    if (!era) return '';
    const n = y - era[2];
    return `${era[1]}${n === 1 ? '元' : n}年`;
  }
  // 入力のチェック。問題なければ ''、あればその理由
  function check(b, today = new Date()) {
    if (!b.name) return '名前を入力してください';
    if (!(b.month >= 1 && b.month <= 12) || !(b.day >= 1 && b.day <= daysInMonth(b.month))) return '月日を選んでください';
    if (b.year != null) {
      if (!Number.isInteger(b.year) || b.year < 1900) return '生まれた年は 1990 のように4けたで入力してください';
      if (b.month === 2 && b.day === 29 && !isLeap(b.year)) return `${b.year}年は2月29日がない年です`;
      if (new Date(b.year, b.month - 1, b.day) > midnight(today)) return 'まだ来ていない日付です';
    }
    return '';
  }

  // 通知すべきもの。「○日前（初めて期間に入ったとき1回）」と「当日」に1回ずつ。
  // notified: すでに通知したキーの入れ物 { キー: 時刻 }
  function due(list, notifyDays, notified, today = new Date()) {
    const out = [];
    for (const b of list) {
      const n = next(b, today), occ = ymd(n.date);
      const kind = n.days === 0 ? 'day' : n.days <= notifyDays ? 'pre' : '';
      const key = `${b.id}:${occ}:${kind}`;
      if (kind && !notified[key]) out.push({ b, n, key });
    }
    return out;
  }
  // 通知の文面
  function message(b, n) {
    if (n.days === 0) return { title: `🎉 今日は${b.name}の誕生日`, body: n.age != null ? `${n.age}歳になりました。おめでとうを伝えよう` : 'おめでとうを伝えよう' };
    return { title: `🎂 ${b.name}の誕生日まであと${n.days}日`, body: `${label(n.date)}${n.age != null ? ` · ${n.age}歳になります` : ''}` };
  }
  // 通知済みの記録から、古いもの（40日より前の誕生日）を捨てる
  function prune(notified, today = new Date()) {
    const limit = ymd(new Date(midnight(today) - 40 * DAY));
    return Object.fromEntries(Object.entries(notified).filter(([k]) => (k.split(':')[1] || '') >= limit));
  }

  // Google カレンダーに「毎年くり返す終日の予定」を追加するページの URL（名前と生まれた年だけを送る）
  function gcalUrl(b, today = new Date()) {
    const start = next(b, today).date, end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    // 2月29日生まれは「2月の最後の日」でくり返す（うるう年以外は2月28日）
    const recur = b.month === 2 && b.day === 29 ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY';
    const q = new URLSearchParams({ action: 'TEMPLATE', text: `🎂 ${b.name}の誕生日`, dates: `${f(start)}/${f(end)}`, recur });
    if (b.year) q.set('details', `${b.year}年生まれ（マイノートから登録）`);
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  return { isLeap, daysInMonth, dateIn, next, ageNow, label, wareki, check, due, message, prune, gcalUrl, ymd };
})();
if (typeof module !== 'undefined') module.exports = BD;
