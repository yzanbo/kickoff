# Kickoff の書き方の決まり

要件は `docs/requirements.md`、全体の設計（語彙・スキーマ・構成・依存の向き）は `docs/architecture.md`、開発のコマンドは `README.md`。ここには、どこを触るときにも守る決まりだけを書く。仕組みと振る舞いの説明は、そのフォルダの `CLAUDE.md`（そのフォルダのファイルを読むと読み込まれる）にある。機能の説明はここに書かない。

## 説明の置き場所

| 触る所 | 読む `CLAUDE.md` |
|---|---|
| 共有の型・決まり・IPC の取り決め（`src/shared`） | `src/shared/CLAUDE.md` |
| コア（DB・HTTP API・外部コマンド・Git・使用状況・音声入力） | `src/core/CLAUDE.md` |
| チャットの実行（送る・送信待ち・止まったあとの再開・承認・分岐と巻き戻し） | `src/core/chat/CLAUDE.md` |
| プロバイダー（Claude Code） | `src/core/providers/CLAUDE.md` |
| Electron のメインプロセス・preload | `src/main/CLAUDE.md` |
| 画面全体（置き場所・データ・保存・API の窓口・共有部品・表示・性能） | `src/renderer/src/CLAUDE.md` |
| 画面の領域 | `src/renderer/src/features/<領域>/CLAUDE.md`（chat・chatList・sidebar・board・panel・project・palette・editor・worktree・settings・terminal・popout・memo・snippet・database・github。小さな領域がどこに書いてあるかは画面全体の `CLAUDE.md` の表） |
| CSS | `src/renderer/src/styles/CLAUDE.md` |

新しい領域を作ったら、そのフォルダに `CLAUDE.md` を足し、この表と画面全体の表に 1 行足す。振る舞いを変えたら、その領域の `CLAUDE.md` も同じコミットで直す。

## 語彙と名前

- 画面の言葉とコードの名前を 1 対 1 にする: チャット = `Chat`（表 `chats`・`chat_id`）、送ってから終わるまでの 1 回の実行 = `Turn`、チャットの記録 = `ChatEvent`、グループ = `ChatGroup`、送信待ち = `Queue`、作業中の様子 = `ChatLive`、未読 / 既読 = `unread` / `read`、チャットの選択（モデル・深さ・権限・ファスト）= `ChatOptions`、権限モード = `PermissionMode`、タブの入れ物 = `Panel`。新しい言葉を足したら `docs/architecture.md` の「語彙」に足す。
- HTTP API・SSE・DB に出る形は snake_case。コードの変数・関数・画面の中だけの型・IPC の形は camelCase。外のツールの形を写すもの（AskUserQuestion の `multiSelect` など）はそのまま。
- 「ない」は `null`（空文字で「本体」「不明」を表さない）。
- 状態などの値の一覧は `as const` の配列から型を作り、画面の文言は同じ場所の `…_LABELS` に置く。
- コメントと画面の文言は日本語、変数名・関数名は英語。
- 画面の文言で単独の「メイン」を使わない。チャットは関係（親チャット / 子チャット / 孫チャット。足す先のチャットは名前）、AI はメインエージェント / サブエージェント、動詞は向きで伝える（下へ）・聞く（横へ）・渡す（上へ）と分ける（`docs/architecture.md` の「チャットの軸とエージェントの軸」）。
- macOS のファイル名は大文字・小文字を区別しないので、部品（`FileTree.tsx`）と補助（`fileTree.ts`）のように、大文字・小文字だけが違う名前を付けない。

## 層と依存の向き

- `src/shared` は、どのプロセスからも使う型と純粋な関数（Node・DOM・Electron・React に依存しない）。import は `@shared/…`。
- コア（`src/core`。Electron に依存しないサーバー）と画面（`src/renderer`）は互いに import しない。両方で使うものは `src/shared` に置く。メインプロセスはコアを読んでよい。
- 画面の中は `app → features → stores / api / ui / hooks / lib → @shared`。ui / hooks / lib / stores / api は features・app を import しない。画面の import は同じフォルダなら `./`、それ以外は `@/…`（`../` でたどらない）。コアとメインの中は相対パスに `.js` を付ける。
- 書く前に、各フォルダの `CLAUDE.md` の共有の部品・hooks・補助で足りないか探す。同じ形を 2 か所目に書くことになったら、共有にしてから使う。
- 1 ファイルが 300 行を超えたら分割を考える。大きな部品は「状態と操作の hook」と「描く部品」に分ける。

## 保存の形

- DB のスキーマは `src/core/db/schema.ts`。表はすべて STRICT、真偽値は `CHECK (x IN (0, 1))`、JSON は `CHECK (json_valid(x) AND json_type(x) = …)`。値の一覧（状態・権限モードなど）は CHECK にしない（増やすたびに表を作り直すことになるため）。版は `PRAGMA application_id`（'KICK'）と `user_version`（200 ＋ 版）で持ち、変えるときは `MIGRATIONS` の末尾に追記する（既存の要素は書き換えない）。読み書きは表ごとの店（`store.chats.get` など）を通す。
- 画面の保存（localStorage・sessionStorage）は、すべて `src/renderer/src/lib/storageKeys.ts` で宣言し、読み書きは `useSetting` / `readSetting` を通す（部品から直接読み書きしない）。宣言していないキーは起動したときに消える。プロジェクト・チャットなどの ID を含むものは `ids` を付ける（DB を作り直したら捨てる）。
- 秘密の値（API キーなど）は `secrets` の表に置き、設定・SSE・API の応答には出さない（保存したかだけを返す）。

## 製品版の Kickoff で Kickoff を作るとき

このリポジトリのチャットは、製品版の Kickoff（`/Applications/Kickoff.app`。プロセス名 `Kickoff`、データ `~/Library/Application Support/Kickoff`、ポート 4317）の中で動いていることがある。作って確かめるのは開発版（Kickoff Dev。プロセスは `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .`、データ `Kickoff Dev`、ポート 4318）だけで、製品版は自分を動かしているアプリなので触らない。

- エージェントは、自分を動かしている Kickoff（プロセス・アプリ本体・保存先・API のポート）を壊すツールの呼び出しを、`PreToolUse` フックで断られる（`src/core/chat/guard/selfProtection.ts`。権限モードに関係なく効く）。うっかりを防ぐもので、わざと避ける書き方までは見抜けないので、下の決まりも守る。
- 製品版を止めない・入れ替えない。`pkill` / `killall` は `.claude/settings.json` で禁止してある。開発版を止めるときは `pgrep -f "Electron.app/Contents/MacOS/Electron \."` でメインプロセスを特定して `kill -TERM` だけを送る（まとめて止めると、書きかけの localStorage が消える）。その前に `/api/status` で作業中のチャットがないことを確かめる。
- `npm run install-app`（製品版の入れ替え）は、製品版の中のチャット・ターミナルから流さない（実行中のチャット・`KICKOFF_TERMINAL_OF` を見て止まる）。必要なら、利用者に macOS のターミナルで流すよう頼む。
- 製品版の中から起動した開発版は、製品版の子どものプロセスになる。製品版は終わるとき、先に子の Electron のアプリを止める（`src/main/app/childApps.ts`）。
- 同じ作業場所（本体のフォルダ）を、複数のチャットで同時に書き換えない。並行して進めるときは、チャットごとにワークツリーを使う。
- 開発版などの終わらないコマンドを裏で動かしたまま返答を終えない（チャットが作業中のまま終わらない）。確かめが済んだら止める。

## 確かめ方

- 型は `npm run typecheck`（使っていない import・変数も残さない）、テストは `npm test`、使っていない export・ファイル・依存は `npm run knip`、ビルドは `npm run build`。区切りごとに 4 つとも通してからコミットする。
- 純粋な関数にはテストを書く（`*.test.ts` を対象の隣に。`node:test`）。テストのデータは `@shared/testing/factories`、一時フォルダ・Git の作業場所・コアの準備は `src/core/testing` の補助を使い、テストごとに書き直さない。API を変えたら、その領域の `src/core/http/server.<領域>.test.ts` にテストを足す。
- 画面の変更は、開発版（`KICKOFF_REMOTE_DEBUG=9333 npm run dev`。CDP のポートは 9333）で実際に動かして確かめる。ボタンの見た目を変えたら `node scripts/ui-audit-buttons.mjs [#/hash ...]`、見た目を変えないはずの変更は `node scripts/ui-snapshot.mjs take <名前> [#/hash]` で前後を記録して `diff` で比べる。
- 利用者の localStorage を書き換えて確かめたら、元の値に戻す。
- コミットは区切りごとに日本語で「種類: 内容」（`feat` / `fix` / `refactor` / `test` / `docs`）。不具合の修正は、リファクタとは別のコミットにする。
