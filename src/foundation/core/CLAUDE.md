# コアの土台（`src/foundation/core`）

Electron に依存しないサーバー（HTTP・SQLite・外部コマンド・AI の操作ツール）の、機能に依らない土台。組み立てと起動は `src/app/core/`、機能のコアは `src/features/<機能>/core/`。

## 口の一覧
- `kernel.ts`（`Kernel`）・`bus.ts`（知らせ `Bus`。SSE で配る）・`errors.ts`（`Invalid` / `NotFound` / `Conflict`）・`clock.ts`（`Clock`）・`undo.ts`・`feature.ts`（`CoreFeature`）・`serve.ts`
- `db/`: `openDb`・`table()`（列の宣言で行と型を変換）・`inspectSchema`・パスとフォルダの中の条件 `pathOrInside`。`settings/`: 設定と秘密の値
- `http/`: `implement.ts`（取り決めを受ける）・`mount.ts`・`lookups.ts`（`withProject` / `withWorkdir`）・`input.ts`（`jsonBody`・`queryOf`）・`sseData.ts`・`deviceAccess.ts`・`framePage.ts`（閉じた枠のページ。Mermaid の枠もここ）
- `aiTools/`: `defineAiTool`・`AiToolRegistry`・`McpToolHost`（1 つの MCP サーバー `/mcp/<名前>`）
- `system/`: `runCommand`・`streamCommand`・`paths.ts`（`toApiPath`）・`appEnv.ts`・`stallWatch.ts`・`childProcesses.ts`。`platform/`: `HostPlatform`（macOS は `macos/`）
- `workplace/`（git・ワークツリー・`carry.ts`）・`files/`（`folderFiles`。別のディスクへも移す `movePath`）・`shell/shellWords.ts`・`watch/`（`Poller`・`Lease`）・`host/`（メインとの RPC）
- `testing/`: `memoryDb`・`until`・`manualClock`・`tempDir`・`gitRepo`・`sse`・`testClient`・`quietShell`・`record`

## 決まり
- 時間に頼る処理は `Clock` を受ける（`setTimeout`・`Date.now()` を直に書かない）。知らせはすべて `Bus` を通す（SSE へ直に書かない）。
- 表はすべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON は `json_valid` と `json_type`。値の一覧は CHECK にしない。版は `@/app/core/migrations.ts` の末尾に足し、版ごとに 1 つのトランザクション。
- 読み書きは表ごとの店（機能の `core/db/<表>.ts`）を通し、ルートで SQL を書かない。変える操作は `onChange` で知らせる（秘密の値は知らせない）。
- ルートは機能の取り決めを `implement.ts` で受けて `CoreFeature.routes` で出す。本文とクエリは zod で確かめる。失敗は `Invalid` / `NotFound` / `Conflict` を投げ、包み直さない（外の SDK は `.catch(asInvalid)`）。
- 応答は、変えたら変えたあとの資源・作ったら 201・待たずに始めたら 202・返すものがなければ 204。API・SSE の形は足すだけ（壊すなら `API_VERSION` を上げる）。
- 外部コマンドは `runCommand`（`execFileAsync` を直に使わない）。git・gh は聞かれても待たない（`nonInteractiveEnv()`）。OS ごとの違いは `HostPlatform` に口を足す。
- API・SSE・DB に出す相対パスの区切りはいつも「/」（`toApiPath`）。
- SSE の種類は `@shared/<機能>/events.ts` に足す（端末に届けるなら `access: "device"`）。設定は `k.settings.get` が既定とまぜ（知らないキーは捨てる）、`update` は送ったキーだけ変える。
- AI の操作ツールは `defineAiTool` で作り、組 `AiToolGroup` を `CoreFeature.aiTools` で出す。`autoAllow` は承認をツールの中で行う・読むだけのもの。権限モードによらず聞くものはツールの中で `turn.ask`。使い方とデータを信頼しないことは組の `instructions`（作業によって足す文は `(turn) => …` で。ツールを出さず文だけの組を作らない）。

## 落とし穴
- 終わるときの順: `stopPhase: "first"` → 流れ続けている外部コマンド → 残りの機能を作った順の逆 → `bus.flush` → HTTP → DB（`serve.ts`）。
- 知らない版の DB（ほかのアプリ・新しすぎる版）は開かずに止まる（WAL にする前に `inspectSchema` が投げる）。
- `chat_delta` はほかの知らせより先に流す（`@/features/chat/core/deltaStage.ts`）。どの購読者から見ても順が同じになるよう `Bus` 1 本。
- 子のプロセスを起こしたら `reportChildProcess` で知らせる（コアが落ちたらメインが止める）。重い同期の処理は `timed` / `noteSync` で名前を付ける。
- `/api/*` は認証より前に、Origin が本体と違う書き換え・WebSocket を 403、本文 `MAX_BODY_BYTES` 超えを 413 で断る（`http/app.ts`）。JSON の本文は content-type を確かめる（`jsonBody`）。
- MCP の口は `/api/*` の認証の外で、実行ごとの鍵だけを受ける（違えば 401）。鍵は環境変数で渡さない（AI が Bash で読めない）。終わったら失敗でも鍵を捨てる。
- SSE はつないだらすぐ hello を送る（書くまで応答ヘッダーが届かない）。JSON は知らせごとに 1 回だけ作る。知らせは `sseStream` の `send` で送る（読まれずにたまった分が上限を超えたら切る）。
- `meta` の `database_id` は DB を作ったときの ID（画面が ID 入りの保存を捨てる・スマホが本体を見分ける目印）。製品版と開発版は `APP_ENVS` の別の保存先とポートで同時に動く。
- ログインシェルの PATH の読み直しは裏で流し、待つのは外部コマンドを起こす所だけ（`shellPathSettled()`）。
- テスト: DB はメモリ、外のネットワーク・本物の AI は呼ばない。API は `@/app/core/testing/testServer.ts` の `setup({ features })` の `api`、待つのは `until`、作ったものは `afterTest` で止める。ルートを変えたら機能の `core/routes.test.ts` に足す。
