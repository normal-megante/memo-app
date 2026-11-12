# マイノート（memo-app）

スマホで使うメモアプリ。メモ・ひらめき・予定・ファイル・金庫（パスワード等）をまとめて持つ。

## Claude への作業ルール

- ユーザーはプログラミング初心者。説明は日本語で、専門用語はかみ砕いて短く説明する。
- いきなり大きく作らない。各ステップの前に「何を作るか」を示し、確認を取ってから進める。
- 1ステップごとに「動くもの」を作り、ユーザーがスマホで試せる状態にしてから次へ進む。
- 機能の注意点は、その機能のすぐ横に短い一言として画面に書く（離れた場所にまとめない）。
- このフォルダは GitHub で**公開**する。個人の情報（本名・個人のメールアドレス・PC 内のフルパスなど）をファイルやコミットに書かない。
- 公開・更新はユーザーが GitHub Desktop で行う（このPCに gh コマンドはない）。私がコミット → ユーザーが「Push origin」。

## 前提・制約

- メインはスマホ（**Android / Chrome**）。ホーム画面に追加してアプリのように使う（PWA）。
- サーバーは使わない。データはすべてスマホの中（IndexedDB、DB 名 `mynote`）に保存する。
- 公開先：GitHub Pages（`<アカウント>.github.io/memo-app/`）。ほかのアプリ（単語帳・計算機など）と**同じ住所（オリジン）**なので、
  - manifest の `id` は `memo-app/` にする（`./` にすると他のアプリと同じアプリ扱いになる）。
  - IndexedDB の DB 名・localStorage のキーが他のアプリとぶつからないようにする。
- メモが消えるのが一番こわい。バックアップ（書き出し・共有）と `navigator.storage.persist()` で守る。

## ファイル

- `index.html` … 画面の骨組み（下のタブ・右下の＋ボタン・下から出るシート）
- `style.css` … 見た目（ダークモード対応）
- `db.js` … IndexedDB の薄いラッパー（棚：notes / events / files / meta）
- `app.js` … 画面と機能のすべて
- `sw.js` … オフライン用のキャッシュ。**ファイルを変えたら `C`（キャッシュ名）の番号を上げる**
- `icons/` … アイコン（`icon.svg` が元。PNG は `tools/make-icons.py` で作る）
- `dev-server.py` … PC での確認用サーバー（`python dev-server.py` → http://localhost:8170）
- `tests/` … `node --test`（PowerShell で実行）

## データの形（IndexedDB `mynote`）

- `notes`：`{ id, kind, title, body, genre, pinned, links, created, updated }`
  - `kind`：`memo`（メモタブ）／`question`・`curious`・`link`（ひらめきタブ）
- `events`：`{ id, date: 'YYYY-MM-DD', time, title, memo }`
- `files`：`{ id, name, type, blob, added }`（バックアップには含まれない）
- `meta`：`{ id: キー, v: 値 }`。キー：`genres`、`vault`（暗号化した金庫）、`lastBackup`（最後にバックアップした時刻）、`lastChange`（notes・events・genres・vault を最後に変えた時刻。db.js が自動で記録）、`backupSnooze`（「あとで」を押したときの、次にお知らせする時刻）

## 作る順番と進み具合

1. **仕上げ・データを守る・公開** … 完了（公開とスマホでの確認待ち）
   - `storage.persist()`、バックアップを共有（Google ドライブ等）、しばらくバックアップしていないとお知らせ
   - PNG アイコン・manifest の id、検索欄の日本語入力の不具合などを直す
2. **🎂 誕生日タブ** … 未着手
   - 名前・月日・生まれた年（空でもよい）・メモ。次の誕生日が近い順、年齢表示。予定カレンダーに🎂
   - お知らせ：①アプリを開いたら上に表示 ②スマホ通知（periodic background sync。届かない日もある）③Google カレンダー登録リンク
3. **📋 コピーしやすく** … 未着手
   - タップでまず「見る画面」。全部コピー・1行タップでコピー・範囲コピー・一覧からコピー
4. **💡 ひらめきスタンプ** … 未着手
   - 書いた日に「済」スタンプ・連続日数・⭐「いいの思いついた！」（⭐の日は金色）。コインやノルマはなし（ゆるめに）
