# Kickoff の書き方の決まり

要件は `docs/requirements.md`、設計（語彙・構成）は `docs/architecture.md`、コマンドは `README.md`。ここには、どこを触るときにも守る決まりだけを書く。仕組みは、そのフォルダの `CLAUDE.md` にある（機能の説明はここに書かない）。

## 説明の置き場所

| 触る所 | 読む `CLAUDE.md` |
|---|---|
| 共有の型・決まり（`src/shared`） | `src/shared/CLAUDE.md` |
| コアの土台（DB・HTTP・外部コマンド） | `src/foundation/core/CLAUDE.md` |
| メインプロセス・preload の土台 | `src/foundation/desktop/CLAUDE.md` |
| 画面の土台（データ・保存・共有部品・性能） | `src/foundation/ui/CLAUDE.md` |
| CSS | `src/foundation/ui/styles/CLAUDE.md` |
| 機能 | `src/features/<機能>/CLAUDE.md` |
| スマホのアプリ | `mobile/CLAUDE.md` |

新しい機能を作ったら、そのフォルダに `CLAUDE.md` を足す（`src/app` には置かない）。振る舞いを変えたら、その機能の `CLAUDE.md` も同じコミットで直す。

## 語彙と名前

- 画面の言葉とコードの名前を 1 対 1 にする: チャット = `Chat`（表 `chats`・`chat_id`）、1 回の実行 = `TurnRequest`（結果 `TurnOutcome`）、記録 = `ChatEvent`、グループ = `ChatGroup`、送信待ち = `Outbox`（1 件は `QueuedMessage`）、作業中の様子 = `ChatLive`、未読 / 既読 = `unread` / `read`、チャットの選択 = `ChatOptions`、権限モード = `PermissionMode`、タブの入れ物 = `Panel`。新しい言葉は `docs/architecture.md` の「語彙」に足す。
- HTTP API・SSE・DB に出る形は snake_case。コードの変数・関数・画面の中だけの型・IPC の形は camelCase。外のツールの形を写すもの（AskUserQuestion の `multiSelect` など）はそのまま。
- 「ない」は `null`（空文字で「本体」「不明」を表さない）。
- 値の一覧は `as const` の配列から型を作り、画面の文言は同じ場所の `…_LABELS` に置く。
- コメントと画面の文言は日本語、変数名・関数名は英語。
- 画面の文言で単独の「メイン」を使わない。チャットは関係（親 / 子 / 孫チャット）か名前、AI はメインエージェント / サブエージェント、動詞は向きで伝える（下へ）・聞く（横へ）・渡す（上へ）と分ける（`docs/architecture.md` の「チャットの軸とエージェントの軸」）。
- 大文字・小文字だけが違う名前を付けない（macOS は区別しない。`FileTree.tsx` と `fileTree.ts` など）。

## 層と依存の向き

- `src/shared` は純粋な型と関数（Node・DOM・Electron・React・npm のパッケージに依らない。スマホも読む）。
- 土台 `src/foundation`（`core`・`ui`・`desktop`）は機能を読まない。機能の力が要るときは土台が口を宣言し、機能が登録して `src/app` が渡す。
- 機能 `src/features/<機能>`（`core`・`ui`・`desktop`・`worker`）は `src/shared`・土台と、下の機能の入口（`core`・`ui` の `index.ts`）だけを読む。`src/app` は読まない。
- 組み立て `src/app` だけが全部の機能を知る。コアと画面は互いに読まない（両方で使うものは `src/shared`）。
- import は同じフォルダなら `./`、それ以外は `@shared/…` か `@/…`（`../` と `.js` は付けない）。
- 書く前に、各フォルダの `CLAUDE.md` の共有の部品・hooks・補助で足りないか探す。同じ形を 2 か所目に書くなら、共有にしてから使う。
- 1 ファイルが 300 行を超えたら分割を考える。大きな部品は「状態と操作の hook」と「描く部品」に分ける。

## 保存の形

- DB のスキーマは機能の `core/schema.ts`。表はすべて STRICT、真偽値は `CHECK (x IN (0, 1))`、JSON は `CHECK (json_valid(x) AND json_type(x) = …)`。値の一覧は CHECK にしない（増やすたびに表を作り直すため）。
- 版は `PRAGMA application_id`（'KICK'）と `user_version`（300 ＋ 版）。変えるときは `src/app/core/migrations.ts` の末尾に足す（既存は書き換えない）。読み書きは表ごとの店（`store.chats.get` など）を通す。
- 画面の保存（localStorage など）は `src/features/<機能>/ui/storage.ts` で宣言し、`useSetting` / `readSetting` で読み書きする（部品から直接読み書きしない）。宣言していないキーは起動時に消える。ID を含むものは `ids` を付ける（DB を作り直したら捨てる）。
- 秘密の値（API キーなど）は `secrets` の表に置き、設定・SSE・API の応答に出さない（保存したかだけを返す）。

## 製品版の Kickoff で Kickoff を作るとき

このリポジトリのチャットは、製品版の Kickoff（`/Applications/Kickoff.app`。データ `~/Library/Application Support/Kickoff`、ポート 4317）の中で動いていることがある。作って確かめるのは開発版（データ `Kickoff Dev`、ポート 4318）だけ。製品版は自分を動かしているアプリなので触らない。

- Kickoff はメインプロセスと、その子のコアのプロセス（`--service-name=Kickoff Core`。HTTP・DB・エージェント・ターミナル）で動き、チャットの AI・内蔵ターミナルのシェルはコアの子。
- 自分を動かしている Kickoff（プロセス・アプリ・保存先・ポート）を壊すツールの呼び出しは、権限モードに関係なく `PreToolUse` フックが断る（`src/features/guard/core/guard/selfProtection.ts`）。わざと避ける書き方は見抜けないので、下の決まりも守る。
- 製品版を止めない・入れ替えない。`pkill` / `killall` は `.claude/settings.json` で禁止してある。
- 開発版を止めるときは、先に `/api/status` で作業中のチャットがないことを確かめ、`pgrep -f "Electron.app/Contents/MacOS/Electron \."` のメインプロセスに `kill -TERM` だけを送る（まとめて止めると書きかけの localStorage が消える）。コアのプロセスは直接止めない（落ちたとみなして作り直す）。
- `npm run install-app`（製品版の入れ替え）は、製品版の中のチャット・ターミナルから流さない。要るなら利用者に macOS のターミナルで流してもらう。
- 製品版の中から起動した開発版は製品版の子孫になり、製品版は終わるときに先に止める（`src/foundation/desktop/app/childApps.ts`）。
- 同じ作業場所（本体のフォルダ）を複数のチャットで同時に書き換えない（並行するならチャットごとにワークツリー）。
- 開発版などの終わらないコマンドを裏で動かしたまま返答を終えない。確かめが済んだら止める。

## 確かめ方

- 型は `npm run typecheck`（使っていない import・変数も残さない）、テストは `npm test`、使っていない export・ファイル・依存は `npm run knip`、ビルドは `npm run build`。`mobile/` を触ったら `npm run mobile:typecheck` も通す。
- これらと文書・構造・テストの書き方の検査（`scripts/check-docs.mjs`・`check-structure.mjs`・`check-test-rules.mjs`）を、コミットと push のたびに git のフック（`.githooks/`）が流す（文書の検査は `.md` だけのコミットでも）。落ちたら原因を直してからコミット・push し直す。
- フックは作業場所のファイルを確かめるので、コミットしない変更が混ざると止まる。フックを飛ばす書き方（`--no-verify`・`git commit -n`・`core.hooksPath` の書き換え）は使わない（Kickoff の守りと `.claude/settings.json` が断る）。
- テストは Vitest。作業中は `npm run test:changed`（変えたファイルに関係するもの）、全体は `npm test`（順番を毎回入れ替える）。どちらも `:isolated` を付けるとファイルごとのプロセスで流す。
- 純粋な関数にはテストを書く（対象の隣に `*.test.ts`。`import { test } from "vitest"` と `node:assert/strict`）。データは `@shared/<機能>/testing`、一時フォルダ・Git の作業場所は `src/foundation/core/testing`、コアの準備は `src/app/core/testing` の補助を使う（テストごとに書き直さない）。API を変えたら、その機能の `core/routes/server.<領域>.test.ts` にテストを足す。
- テストは同じプロセスで続けて流れるので、値をほかのファイルに残さない: グローバルは `vi.stubGlobal`、環境変数は `vi.stubEnv`（`globalThis.x = …`・`process.env.X = …` と直接書かない）、保存は `@/foundation/ui/testing/memoryStorage` の `installMemoryStorage`、偽の時計は `createFakeScheduler`（コア `manualClock`）。
- 作ったもの（見張り・サーバー・一時フォルダ）の後片付けは `onTestFinished` か `src/foundation/core/testing/afterTest.ts` の `afterTest`。共通の準備は `vitest.setup.ts`、組と設定は `vitest.config.ts`。直接書き換える書き方は見張りが落とす（要る行は、その行か 1 つ上に `test-rules-ignore: 理由`）。
- 画面の変更は開発版（`npm run dev:cdp`。CDP は 9333。AI は砂場の外で起動するよう、前に VAR=値・後ろにパイプ・リダイレクトを付けず単独で流す）で動かして確かめる。ボタンの見た目は `node scripts/ui-audit-buttons.mjs`、見た目を変えないはずの変更は `node scripts/ui-snapshot.mjs take <名前>` の前後を `diff` で比べる。
- 利用者の localStorage を書き換えて確かめたら、元の値に戻す。
- コミットは区切りごとに日本語で「種類: 内容」（`feat` / `fix` / `refactor` / `test` / `docs`）。不具合の修正は、リファクタとは別のコミットにする。
