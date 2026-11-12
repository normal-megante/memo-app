// ホーム画面に追加（PWA）まわりのテスト
// 実行方法（memo-app フォルダで、PowerShell から）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// sw.js の PRECACHE に書いてあるファイル名を取り出す
function precacheList() {
  const source = readFileSync(join(root, 'sw.js'), 'utf8');
  const block = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js に PRECACHE が見つかりません');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('アプリのファイルは全部 sw.js の PRECACHE に書いてある', () => {
  const list = precacheList();
  const needed = [
    'index.html', 'style.css', 'db.js', 'birthday.js', 'app.js', 'manifest.webmanifest',
    ...readdirSync(join(root, 'icons')).map((f) => `icons/${f}`),
  ];
  const missing = needed.filter((file) => !list.includes(file));
  assert.deepEqual(missing, [], `sw.js の PRECACHE に書き足してください: ${missing.join(', ')}`);
});

test('PRECACHE に書いてあるファイルは、ちゃんと存在する', () => {
  const notFound = precacheList().filter((file) => file !== './' && !existsSync(join(root, file)));
  assert.deepEqual(notFound, [], `存在しないファイルがあります: ${notFound.join(', ')}`);
});

test('index.html が読み込むファイルは存在する', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('http'));
  for (const ref of refs) assert.ok(existsSync(join(root, ref)), `ありません: ${ref}`);
});

test('manifest の内容とアイコン', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  // id は './' や '/' にしない（同じ github.io のほかのアプリと「同じアプリ」とみなされ、
  // 「すでにインストールされています」になる）
  assert.ok(manifest.id && !['', '.', './', '/'].includes(manifest.id), 'manifest の id');
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, icon.src)), `アイコンがありません: ${icon.src}`);
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('sw.js は同じ github.io の他のアプリのキャッシュを消さない', () => {
  const source = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(source, /startsWith\('mynote-'\)/);
});
