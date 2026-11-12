// 誕生日の計算のテスト（実行方法：memo-app フォルダで node --test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const BD = createRequire(import.meta.url)('../birthday.js');
const day = (y, m, d) => new Date(y, m - 1, d, 15, 30); // 時刻はわざと昼すぎにしておく

test('次の誕生日まであと何日・何歳になるか', () => {
  const b = { month: 4, day: 15, year: 1998 };
  let n = BD.next(b, day(2026, 4, 3));
  assert.equal(n.days, 12);
  assert.equal(n.age, 28);
  assert.equal(BD.ageNow(b, day(2026, 4, 3)), 27);
  n = BD.next(b, day(2026, 4, 15)); // 当日
  assert.equal(n.days, 0);
  assert.equal(BD.ageNow(b, day(2026, 4, 15)), 28);
  n = BD.next(b, day(2026, 4, 16)); // 過ぎたら来年
  assert.equal(n.days, 364);
  assert.equal(n.age, 29);
});

test('年をまたぐ・生まれた年がない', () => {
  const n = BD.next({ month: 1, day: 3, year: null }, day(2026, 12, 30));
  assert.equal(n.days, 4);
  assert.equal(n.date.getFullYear(), 2027);
  assert.equal(n.age, null);
  assert.equal(BD.ageNow({ month: 1, day: 3, year: null }), null);
});

test('2月29日生まれは、うるう年以外は2月28日', () => {
  const b = { month: 2, day: 29, year: 2000 };
  const n = BD.next(b, day(2027, 2, 1));
  assert.equal(n.date.getMonth() + 1, 2);
  assert.equal(n.date.getDate(), 28);
  assert.equal(BD.ageNow(b, day(2027, 2, 27)), 26);
  assert.equal(BD.ageNow(b, day(2027, 2, 28)), 27);
  assert.equal(BD.next(b, day(2028, 2, 1)).date.getDate(), 29);
});

test('曜日つきの表示と和暦', () => {
  assert.equal(BD.label(new Date(2026, 3, 15)), '4月15日(水)');
  assert.equal(BD.wareki(1998, 4, 15), '平成10年');
  assert.equal(BD.wareki(1989, 1, 7), '昭和64年');
  assert.equal(BD.wareki(1989, 1, 8), '平成元年');
  assert.equal(BD.wareki(2019, 4, 30), '平成31年');
  assert.equal(BD.wareki(2019, 5, 1), '令和元年');
  assert.equal(BD.wareki(1950, 6, 1), '昭和25年');
});

test('入力のチェック', () => {
  const today = day(2026, 11, 12);
  assert.equal(BD.check({ name: 'A', month: 4, day: 15, year: null }, today), '');
  assert.equal(BD.check({ name: 'A', month: 4, day: 15, year: 1998 }, today), '');
  assert.notEqual(BD.check({ name: '', month: 4, day: 15, year: null }, today), '');
  assert.notEqual(BD.check({ name: 'A', month: 4, day: 31, year: null }, today), '');
  assert.notEqual(BD.check({ name: 'A', month: 2, day: 29, year: 2001 }, today), '');
  assert.equal(BD.check({ name: 'A', month: 2, day: 29, year: 2000 }, today), '');
  assert.notEqual(BD.check({ name: 'A', month: 12, day: 1, year: 2026 }, today), '');
  assert.notEqual(BD.check({ name: 'A', month: 4, day: 15, year: 98 }, today), '');
});

test('通知：期間に入ったら1回、当日に1回、同じものは2度出さない', () => {
  const list = [{ id: 'a', name: '花子', month: 4, day: 15, year: 1998 }, { id: 'b', name: '太郎', month: 6, day: 1, year: null }];
  const notified = {};
  let due = BD.due(list, 7, notified, day(2026, 4, 5)); // 10日前 → まだ
  assert.equal(due.length, 0);
  due = BD.due(list, 7, notified, day(2026, 4, 10)); // 5日前 → 1回
  assert.deepEqual(due.map(d => d.key), ['a:2026-04-15:pre']);
  assert.equal(BD.message(due[0].b, due[0].n).title, '🎂 花子の誕生日まであと5日');
  notified[due[0].key] = 1;
  assert.equal(BD.due(list, 7, notified, day(2026, 4, 12)).length, 0); // 次の日はもう出さない
  due = BD.due(list, 7, notified, day(2026, 4, 15)); // 当日
  assert.deepEqual(due.map(d => d.key), ['a:2026-04-15:day']);
  assert.match(BD.message(due[0].b, due[0].n).body, /28歳/);
  // 「当日だけ」の設定では前の通知は出さない
  assert.equal(BD.due(list, 0, {}, day(2026, 4, 14)).length, 0);
  // 古い記録は捨てる
  const pruned = BD.prune({ 'a:2026-04-15:day': 1, 'a:2025-04-15:day': 1 }, day(2026, 4, 20));
  assert.deepEqual(Object.keys(pruned), ['a:2026-04-15:day']);
});

test('Google カレンダーの URL（毎年くり返す終日の予定）', () => {
  const u = new URL(BD.gcalUrl({ name: '花子', month: 4, day: 15, year: 1998, memo: 'ひみつ' }, day(2026, 4, 3)));
  assert.equal(u.hostname, 'calendar.google.com');
  assert.equal(u.searchParams.get('dates'), '20260415/20260416');
  assert.equal(u.searchParams.get('recur'), 'RRULE:FREQ=YEARLY');
  assert.equal(u.searchParams.get('text'), '🎂 花子の誕生日');
  assert.ok(!u.toString().includes(encodeURIComponent('ひみつ')), 'メモは送らない');
  const leap = new URL(BD.gcalUrl({ name: 'A', month: 2, day: 29, year: null }, day(2027, 1, 1)));
  assert.equal(leap.searchParams.get('dates'), '20270228/20270301');
  assert.match(leap.searchParams.get('recur'), /BYMONTHDAY=-1/);
  assert.equal(leap.searchParams.get('details'), null);
});
