# Kickoff の書き方の決まり

どこを触るときにも守る決まり。構成・機能の一覧・語彙は `docs/architecture.md`、受け入れの一覧は `docs/features.md`、コマンドは `README.md`。機能の決まりは、そのフォルダの `CLAUDE.md`（地図・決まり・落とし穴）。

## 置き場所
- `src/shared`: 純粋な土台（`foundation/`）と機能の取り決め（`<機能>/` の `contract.ts`・`events.ts`・`settings.ts`・`types.ts`）。コア・画面・スマホで同じ決まりはここに 1 つ。Node・DOM・React・Electron・npm のパッケージ（zod も）を読まない。
- `src/foundation/{core,ui,desktop}`: 土台（機能の言葉を持たない）。口の一覧は各 `CLAUDE.md`、CSS は `src/foundation/ui/styles/CLAUDE.md`。
- `src/features/<機能>/{core,ui,desktop,worker}`: 機能。並び順は `scripts/structure.config.mjs` の `FEATURES`。
- `src/app`: 組み立て。機能を並べるだけ（`CLAUDE.md` も置かない）。
- `mobile/`: スマホ（`mobile/CLAUDE.md`）。読んでよいのは `src/shared` と `src/app/shared`。
- 振る舞いを変えたら、その機能の `CLAUDE.md` も同じコミットで直す。

## 層と依存の向き
- 下の機能は上の機能を、土台は機能を、機能は `src/app` を読まない。下が上の力を要るときは、下が口（拡張点など）を宣言し、上が登録して `src/app` が渡す。import した時の副作用で登録しない。
- ほかの機能は入口（`core/index.ts`・`ui/index.ts`。テストは `testing.ts` も）だけを読む。`src/shared/<機能>` は直に読んでよい。コアと画面は互いに読まない。
- 兄弟のフォルダどうしを循環させない。1 ファイル 300 行まで（テスト 400・宣言だけ 500）。大きな部品は「状態と操作の hook」と「描く部品」に分ける。
- import は同じフォルダなら `./`、それ以外は `@shared/…`・`@/…`（`../` と `.js` は付けない）。
- SQL は自分の機能の表だけを書く（ほかの表は持ち主の関数で読む）。CSS は自分の領域のクラスだけ。`window.kickoff` は `src/foundation/ui` と機能の `ui/native.ts` だけが触る。
- 書く前に共有の部品・補助（各 `CLAUDE.md`）で足りないか探す。2 か所目は共有にしてから使う。

## 機能を足すとき
1. `FEATURES`・`docs/architecture.md` の機能の表（同じ並び）・`docs/features.md` に足し、`CLAUDE.md` を置く。
2. 取り決めは `src/shared/<機能>/`（SSE と設定の表は `src/app/shared` に並べる）。
3. コアは `core/index.ts` の `createX(k, deps, env)` を `src/app/core/assemble.ts` に足す。表は `core/schema.ts`、AI のツールは `core/tools.ts` の `defineAiTool`。
4. 画面は `ui/index.ts`・`ui/storage.ts`・`ui/contributes.ts`（拡張点への登録。読むのは `src/app/renderer/registry.ts` だけ）。

## 名前と保存
- 画面の言葉とコードの名前を 1 対 1 にする（新しい言葉は語彙の表に足す）。画面の文言で単独の「メイン」を使わない。
- HTTP・SSE・DB に出る形は snake_case、コードと IPC は camelCase。外のツールの形（`multiSelect` など）はそのまま。「ない」は `null`（空文字で「本体」「不明」を表さない）。値の一覧は `as const` の配列から型を作り、文言は同じ場所の `…_LABELS`。
- コメントと画面の文言は日本語、変数名・関数名は英語。大文字・小文字だけが違う名前を付けない（macOS は区別しない）。
- DB の表は STRICT、真偽値は `CHECK (x IN (0, 1))`、JSON は `json_valid`・`json_type` の CHECK。値の一覧は CHECK にしない（増やすと表を作り直すため）。版は `PRAGMA application_id`（'KICK'）と `user_version`（300 ＋ 版）で、変えるときは `src/app/core/migrations.ts` の末尾に足す。読み書きは表ごとの店（`store.chats.get` など）を通す。
- 画面の保存は機能の `ui/storage.ts` の `defineSettings` で宣言し、`useSetting` / `readSetting` で読み書きする（宣言していないキーは起動時に消える）。ID を含むものは `ids` を付ける。秘密の値は `secrets` の表に置き、設定・SSE・応答に出さない（保存したかだけを返す）。

## コメントとテスト
- コメントは「なぜ」を書く（守り・順番・競合・ほかのプロセスと同じ前提・単位・`null` の意味）。経緯・依頼の言葉・日付・外の文書の番号は書かない。同じ前提に立つ相手は関数の名前で書く。
- 純粋な関数と部品の計算（`*Model.ts`）にテストを書く（隣に `*.test.ts`。`vitest` の `test` と `node:assert/strict`）。店・部品を `vi.mock` で空にしない。API を変えたら、その機能の `core/routes*.test.ts` に足す。
- 補助を使う: 型の値 `@shared/<機能>/testing`・偽物 `core/testing.ts`・一時フォルダと Git `src/foundation/core/testing`・コアの準備 `src/app/core/testing`。
- テストは同じプロセスで続けて流れるので値を残さない（`vi.stubGlobal`・`vi.stubEnv`・`installMemoryStorage`・`createFakeScheduler`・`manualClock`・`onTestFinished`・`afterTest`）。決め打ちの時間で待たない（`until`）。中の物を角かっこで読まない。`scripts/check-test-rules.mjs` が見張る（要る行は `test-rules-ignore: 理由`）。

## 確かめ方
- `npm run typecheck`（使わない import・変数を残さない）・`npm test`・`npm run knip`・`npm run build`。`mobile/` を触ったら `npm run mobile:typecheck`。作業中は `npm run test:changed`。
- これらと構造・文書・テストの書き方の検査を、コミットと push のたびに git のフック `.githooks/` が流す（`.md` だけでも。コミットしない変更が混ざると止まる）。フックを飛ばす書き方（`--no-verify`・`git commit -n`・`core.hooksPath` の書き換え）は使わない。
- 画面の変更は開発版（`npm run dev:cdp`。CDP は 9333。前に VAR=値・後ろにパイプ・リダイレクトを付けず単独で流す）で確かめる。見た目を変えないはずの変更は `node scripts/ui-snapshot.mjs` で前後を比べる。利用者の localStorage を書き換えたら元に戻す。
- コミットは区切りごとに日本語で「種類: 内容」（`feat`・`fix`・`refactor`・`test`・`docs`）。不具合の修正はリファクタと別のコミット。

## 製品版の Kickoff で Kickoff を作るとき
このリポジトリのチャットは、製品版の Kickoff（`/Applications/Kickoff.app`。データ `~/Library/Application Support/Kickoff`・ポート 4317）の中で動いていることがある。作って確かめるのは開発版（データ `Kickoff Dev`・ポート 4318）だけ。チャットの AI とシェルはコアのプロセス（`--service-name=Kickoff Core`）の子。
- 製品版を止めない・入れ替えない（`pkill` / `killall` は `.claude/settings.json` で禁止）。開発版を止めるときは `/api/status` で作業中のチャットがないことを見て、`pgrep -f "Electron.app/Contents/MacOS/Electron \."` のメインプロセスに `kill -TERM` だけを送る（まとめて止めると書きかけの localStorage が消える。コアは直接止めない）。
- `npm run install-app` は製品版の中のチャット・ターミナルから流さない（利用者が macOS のターミナルで流す）。
- 同じ作業場所を複数のチャットで同時に書き換えない（チャットごとにワークツリー）。終わらないコマンドを裏で動かしたまま返答を終えない。
- 自分を壊すツールの呼び出しは権限モードに関係なく `PreToolUse` フック（`src/features/guard/core/guard/selfProtection.ts`）が断るが、避ける書き方は見抜けないので上の決まりも守る。
