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
- `db.js` … IndexedDB の薄いラッパー（DB v2。棚：notes / events / files / meta / birthdays）。棚を足すときは VERSION を上げる
- `birthday.js` … 誕生日の計算（あと何日・年齢・和暦・通知の判定・Google カレンダーの URL）。app.js と sw.js の両方が使う。画面や保存には触らない
- `stamps.js` … ひらめきスタンプの計算（記録と今あるひらめきを合わせる・連続日数・月の数）。画面や保存には触らない
- `app.js` … 画面と機能のすべて
- `sw.js` … オフライン用のキャッシュと、誕生日の通知（periodicsync `birthday-check`）。**ファイルを変えたら `C`（キャッシュ名）の番号を上げる**
  - 動作確認：アプリから `{type:'bd-dry-run'}` を postMessage すると、通知は出さずに「出すはずの通知のタイトル」を返す
- `icons/` … アイコン（`icon.svg` が元。PNG は `tools/make-icons.py` で作る）
- `dev-server.py` … PC での確認用サーバー（`python dev-server.py` → http://localhost:8170）
- `tests/` … `node --test`（PowerShell で実行）

## データの形（IndexedDB `mynote`）

- `notes`：`{ id, kind, title, body, genre, pinned, star, links, created, updated }`
  - `kind`：`memo`（メモタブ）／`question`・`curious`・`link`（ひらめきタブ）
  - `star`：⭐「いいの思いついた！」（ひらめきだけ。つけても `updated` は変えない）
- `meta` の `ideaDays`：ひらめきスタンプの記録 `{ 'YYYY-MM-DD': 1（済）| 2（金色） }`。保存時に stampIdea() が足す（下げない）。
  画面では、この記録と今あるひらめき（created の日）を合わせて表示するので、ひらめきを消してもスタンプは残る
- `events`：`{ id, date: 'YYYY-MM-DD', time, title, memo }`
- `files`：`{ id, name, type, blob, added }`（バックアップには含まれない）
- `birthdays`：`{ id, name, month: 1〜12, day, year: 生まれた年 or null, memo, updated }`
  - 2月29日生まれは、うるう年以外は2月28日として扱う（Google カレンダーは BYMONTHDAY=-1 で2月の最後の日）
- `meta` の誕生日まわり：`bdDays`（何日前から知らせるか。初期値7）、`bdNotify`（通知オン）、`bdNotified`（通知済みの記録 `{ 'id:誕生日の日付:pre|day': 時刻 }`。sw.js が書く）、`bdHide`（上の帯を✕で隠した日）
- `meta`：`{ id: キー, v: 値 }`。キー：`genres`、`vault`（暗号化した金庫）、`lastBackup`（最後にバックアップした時刻）、`lastChange`（notes・events・genres・vault を最後に変えた時刻。db.js が自動で記録）、`backupSnooze`（「あとで」を押したときの、次にお知らせする時刻）

## 作る順番と進み具合

1. **仕上げ・データを守る・公開** … 完了（公開とスマホでの確認待ち）
   - `storage.persist()`、バックアップを共有（Google ドライブ等）、しばらくバックアップしていないとお知らせ
   - PNG アイコン・manifest の id、検索欄の日本語入力の不具合などを直す
2. **🎂 誕生日タブ** … 完了（スマホでの確認待ち。通知と Google カレンダーはスマホでしか試せない）
   - 名前・月日・生まれた年（空でもよい）・メモ。次の誕生日が近い順、年齢表示。予定カレンダーに🎂
   - お知らせ：①アプリを開いたら上に表示 ②スマホ通知（periodic background sync。届かない日もある）③Google カレンダー登録リンク
3. **📋 コピーしやすく** … 完了（スマホでの確認待ち）
   - タップでまず「見る画面」（viewNote）。全部コピー・タイトル／1行タップでコピー・範囲コピー（はじめ→終わりの行）・一覧の📋で開かずにコピー
   - URL・メール・電話番号・郵便番号を拾ってチップに（findCopyables）。編集→保存で見る画面に戻る
4. **💡 ひらめきスタンプ** … 完了（スマホでの確認待ち）
   - ひらめきタブの上に「ひらめきカード」（月のカレンダーに「済」、⭐の日は金色、連続日数・今月の数）
   - ⭐「いいの思いついた！」は編集画面と見る画面で切り替え。一覧に「⭐ いいのだけ」の絞り込み。コインやノルマはなし（ゆるめに）

最初に決めた4ステップはここまで。次はスマホで使った感想を聞いて決める。
