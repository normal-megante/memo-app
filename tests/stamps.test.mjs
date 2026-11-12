// ひらめきスタンプの計算のテスト（実行方法：memo-app フォルダで node --test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const ST = createRequire(import.meta.url)('../stamps.js');
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('ひらめきを書いた日に済、⭐なら金色。メモは数えない', () => {
  const notes = [
    { kind: 'question', created: at(2026, 11, 10) },
    { kind: 'curious', created: at(2026, 11, 11), star: true },
    { kind: 'link', created: at(2026, 11, 11, 23) },
    { kind: 'memo', created: at(2026, 11, 12) },
  ];
  assert.deepEqual(ST.merge({}, notes), { '2026-11-10': 1, '2026-11-11': 2 });
});

test('記録があれば、ひらめきを消してもスタンプは残る', () => {
  assert.deepEqual(ST.merge({ '2026-11-01': 2 }, [{ kind: 'question', created: at(2026, 11, 1) }]), { '2026-11-01': 2 });
});

test('記録に足す：新しい日・済→金色は足す。下げたり、同じなら何もしない', () => {
  const n = { kind: 'question', created: at(2026, 11, 12) };
  assert.deepEqual(ST.add({}, n), { '2026-11-12': 1 });
  assert.equal(ST.add({ '2026-11-12': 1 }, n), null);
  assert.deepEqual(ST.add({ '2026-11-12': 1 }, { ...n, star: true }), { '2026-11-12': 2 });
  assert.equal(ST.add({ '2026-11-12': 2 }, n), null);
  assert.equal(ST.add({}, { kind: 'memo', created: at(2026, 11, 12) }), null);
});

test('連続日数（今日まだでも昨日まで続いていれば数える）', () => {
  const days = { '2026-11-09': 1, '2026-11-10': 1, '2026-11-11': 2 };
  assert.deepEqual(ST.streak(days, new Date(at(2026, 11, 12))), { n: 3, today: false });
  assert.deepEqual(ST.streak({ ...days, '2026-11-12': 1 }, new Date(at(2026, 11, 12))), { n: 4, today: true });
  assert.deepEqual(ST.streak(days, new Date(at(2026, 11, 13))), { n: 0, today: false });
  // 月・年をまたぐ
  assert.equal(ST.streak({ '2026-12-31': 1, '2027-01-01': 1 }, new Date(at(2027, 1, 1))).n, 2);
});

test('月ごとの数', () => {
  const days = { '2026-11-01': 1, '2026-11-12': 2, '2026-10-31': 2 };
  assert.deepEqual(ST.month(days, 2026, 11), { count: 2, gold: 1 });
  assert.deepEqual(ST.month(days, 2026, 12), { count: 0, gold: 0 });
});
