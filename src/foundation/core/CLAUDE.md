# コアの土台（`src/foundation/core`）

Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）の、機能に依らない土台。組み立てと起動は `src/app/core/`（`startCore.ts`・Mac のアプリのコアのプロセス `hostMain.ts` → `hostRun.ts`・単体の `daemon.ts`）、機能のコア（ルート・表の店・サービス）は `src/features/<機能>/core/`。画面のコードは import しない（共有は `@shared/…`）。

## フォルダの役割

| フォルダ | 中身 |
|---|---|
| `bus.ts`・`errors.ts` | 変更の知らせ `Bus`（`BusEvent`。SSE で配る）・失敗の型 |
| `host/` | メインとの `parentPort` 1 本の RPC（`rpc.ts`。形は `protocol.ts` の 1 か所）。メインにしかない口は `@/app/core/hostRemote.ts` |
| `db/`・`http/` | SQLite（`node:sqlite`）/ Hono の API・認証・SSE・画面の配信 |
| `aiTools/` | AI の操作ツールを出す MCP サーバー |
| `workplace/` | 作業場所（git の実行・ワークツリー・持っていく変更 `carry.ts`・Git でないフォルダ） |
| `platform/` | OS ごとに違う処理の口 `HostPlatform` と macOS の中身（`macos/`）。DB ワーカーは別の口 `ShellPlatform` |
| `system/` | 外部コマンド・パス・`ttlCache.ts`・名前と保存先とポート `appEnv.ts`・開発版のデータの写し `devData.ts`・詰まりの見張り `stallWatch.ts` |
| `settings/`・`shell/`・`testing/` | 設定・Bash の文の区切り `shellWords.ts`・テストの補助 |

- `close`（`@/app/core/startCore.ts`）は止める順を変えない（エージェント → 流れ続けている外部コマンド → 見張りとサービス → DB ワーカー → `bus.flushDeltas` → HTTP → DB。`close` の頭のコメント）。サービスを足したら止めるのも足す。
- 起動のとき、作業中のまま残ったチャットは未読の失敗にし、途中で止まった印のあるものを再開の確かめに渡す（`store.chats.recoverInterrupted`）。終わりの記録のない最後の作業には `endInterruptedTurns` が `result` を足す。
- `chat_delta` はほかの知らせより必ず先に流す（`@/features/chat/core/deltaBatch.ts`）。知らせはすべて `Bus` を通し、`Bus` を通さずに SSE へ書かない（どの購読者から見ても順が同じ）。
- 子のプロセス（エージェントの CLI・DB ワーカーの子・診断の `log`）を起こしたら `system/childProcesses.ts` の `reportChildProcess` で知らせる（コアが落ちたらメインが止める）。
- 眠らせない理由（`@/app/core/hostRun.ts` の `awake`）は作業中の間は一定の間隔でも読み直す（作業の終わりの `chat` は作業中の数が減るより先に流れる）。コアのプロセスの決まりは `src/foundation/desktop/CLAUDE.md` の「コアのプロセス」。
- 重い同期の処理には `stallWatch.ts` の `timed` / `noteSync` で名前を付ける（詰まりの記録に出る）。製品版と開発版は `APP_ENVS` の別の保存先とポートで同時に動く。

## DB（`db/`）

- スキーマは `db/schema.ts` の `MIGRATIONS` の末尾に足して変える（既存の要素は書き換えない）。版ごとに 1 つのトランザクション。
- 表はすべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON は `json_valid` と `json_type`。値の一覧は CHECK にしない。「ない」は NULL で、空文字を入れない列は `CHECK (x <> '')`。
- 版は `application_id`（'KICK'）と `user_version`（200 ＋ 版）。`inspectSchema` で、ほかのアプリ・新しすぎる版ならデータに触らずに（WAL にする前に）例外。
- 読み書きは `Store`（`db/store.ts`）の表ごとの店（各機能の `core/db/<表>.ts` の `createXxxStore(db, onChange)`）を通し、ルートで SQL を書かない。変える操作は `onChange` で知らせる（秘密の値は知らせない）。
- 行と型の変換は店の `toChat` などに集める（真偽値は `db/common.ts` の `bit()`）。変えられる列は `CHAT_COLUMNS` などの 1 つの一覧を、型と `updateRow` の両方に使う。
- `chats.active_at`（一覧の並び順）を進めるのは `status` を変える更新だけ（未読・固定・並び・名前・アーカイブ・移動・復旧では進めない）。
- ゴミ箱にあるチャットは `store.chats` の読み取り（`get`・一覧・子孫・検索・フィードなど）から外す。読み取りを足したらゴミ箱のものを外す。会話記録を残すか（`sessionInUse`）はゴミ箱のものも数える。
- 設定は `store.settings.get` が `DEFAULT_SETTINGS` とまぜる（知らないキーは返さない）。`update` は送ったキーだけを変え、キーの中（`chat_defaults` など）は丸ごと置き換える。
- 秘密の値は `secrets` の表に置き、設定・SSE・応答には保存したかだけを出す。
- `meta` の `database_id` は DB を作ったときの ID（画面が ID 入りの保存を捨てる目印・スマホが本体を見分ける目印）。メインは SQL を流さない（DB の様子は `db/stats.ts`）。

## HTTP（`http/`）

- ルートは各機能の `core/routes/<領域>.ts` の `xxxRoutes(app, deps)` で、`http/server.ts` の `createApp` で登録する。登録の順（認証と `onError` のあと、SSE・API の 404・画面の配信の前）を崩さない。
- `:id` は `http/lookups.ts` のミドルウェア（`withProject` / `withChat` / `withWorkdir` など）で引き、`c.var` で受ける。作業場所の指定は `http/workdir.ts` の `requireWorktree`、チャットのフォルダは `@/features/chat/core/workdir.ts` の `workdirOf`。
- 失敗は `errors.ts` の `Invalid` / `NotFound` / `Conflict` を投げ、`http/errorResponse.ts` が `{ error }` にする（外の SDK は `.catch(asInvalid)`）。包み直さない。作業中に断る操作は `runner.requireIdle`（409）。
- 本文は `http/input.ts` の `jsonBody`、クエリは `queryOf` で読み、zod で確かめる（共通の形は `http/schemas.ts`）。本文の型は `@shared/foundation/apiTypes.ts` に置き、zod は `satisfies` で合わせる。
- 送る指示（文・選択・添付）は、新しいチャット・続き・伝える・送信待ちで同じ形。応答は、変えたら変えたあとの資源・作ったら 201・待たずに始めたら 202・返すものがなければ 204。
- API・SSE の形は 1.0 から「足すだけ」にし、壊すなら `@shared/foundation/api/version` の `API_VERSION` を上げる。下限より古いアプリは認証より前に 426。
- SSE の JSON は `http/sseData.ts` の `sseDataOf` で知らせごとに 1 回だけ作る。つないだらすぐ hello を送る（書くまで応答ヘッダーが届かない）。`onAbort` は最初の `await` より前に登録する。
- SSE の種類を足すときは `BusEvent` に足し、端末に届けるか（`deviceMaySee`）も決める。
- 図の枠のページ `/visual-frame` は画面の CSP を引き継がないよう別のページにする。画面の配信と HTTP サーバーの止め方は `src/foundation/desktop/CLAUDE.md`。

## 外部コマンドとパス（`system/`）

- 外部コマンドは `system/exec.ts` の `runCommand`（失敗の `CommandError` はそのまま投げれば 400）。`execFileAsync` を直接使わない。流れ続けるものだけ `system/stream.ts` の `streamCommand`（閉じるときに `stopAllStreams`）。
- git・gh は `nonInteractiveEnv()` で、聞かれたら待たずに失敗させる。git は `workplace/exec.ts` の `gitOutput` だけを通す。
- OS ごとに違うコマンド・パスは使う所に散らさず、`platform/` の `HostPlatform` に口を足して `platform/macos/` に書く（テストは口ごと偽物に）。
- ログインシェルの PATH の読み直しは裏で流し、待つのは外部コマンドを起こす所だけ（`shellPathSettled()`）。HTTP・DB・画面は待たない。実行ファイルは `findExecutable(names, searchDirs())`。
- API・SSE・DB に出す相対パスの区切りはいつも「/」（`system/paths.ts` の `toApiPath`）。包含・`~`・リンクの解決も `system/paths.ts`。

## AI の操作ツール（`aiTools/`）

- AI に Kickoff を操作させるツール（`kickoff_browser`・`kickoff_db`・`kickoff_chat`）は、どの CLI からもつなげるコアの 1 つの MCP サーバーで出す。
- 定義は `aiTools/tool.ts` の `defineTool`。ここは引数の形・失敗の文・承認の聞き方だけで、中身は各機能の `core/` の `ai…`（`src/features/chat/CLAUDE.md` の「AI の操作ツールの中身」）・`@/features/database/core/aiTools.ts`・`@/features/browser/core/`。結果の形は `aiTools/chatToolResult.ts`。
- 実行ごとに `@/features/chat/core/tools/turnTools.ts` がサーバーを作って `McpToolHost`（`aiTools/host.ts`）に登録し、終わったら（失敗でも）鍵を捨てる。
- 口は `/mcp/<名前>`（`/api/*` の認証の外）で、実行ごとの鍵だけを受ける（違えば見分けさせずに 401）。鍵は環境変数で渡さない（AI が Bash で読めないように）。
- `autoAllow` には、承認と断りをツールの中で行うものと読むだけのものだけを入れる（名前は `mcp__kickoff_chat__` の頭を外す）。
- 権限モード・Auto mode によらず聞くもの（承認の要る `db_query`・「毎回聞く」の `create_chat`）は、ツールの中で `requestApproval`。
- 使い方とデータを信頼しないことは `instructions` で渡す。ツールを足したら `ChatTools`・`instructions`・`autoAllow`・`@/features/chat/core/tools/turnTools.test.ts` も直す。
- 作業の初めにブラウザのタブを使うときは 1 回だけ欄を表に出す（`@/features/browser/core/browserReveal.ts`。Auto mode では承認カードが出ないため）。
- 砂場の拒否の診断（`@/features/guard/core/chatDiagnosticTools.ts`）は生の本文・パス・コマンドラインとほかのチャットのログを返さない。砂場の設定は変えない。

## テスト

- コアのテストの DB はメモリ（`new Store(":memory:")`）で、外のネットワーク・本物の AI は呼ばない。
- 作ったもの（見張り・サーバー・子プロセス・DB ワーカー）は必ず止める（`setup()` の分は `afterTest`。足したら止めるのも足す）。
- API のルートを変えたら、その機能の `core/routes/server.<領域>.test.ts` に足す（認証・SSE・配信は `http/server.test.ts`、端末は `server.devices.test.ts`）。
- 準備の補助: API は `@/app/core/testing/testServer.ts` の `setup()`、`Runner` は `@/app/core/testing/testCore.ts` の `setupCore` と `@/features/ai/core/testing/fakeProvider.ts` の `ScriptedProvider`。前回の起動のデータは `beforeStart` で入れる。
- 条件は `until(cond)` で待つ（2 秒。遅れうるものは `until(cond, ms)`）。決め打ちの時間で待ってから比べない。時計は `testing/fakeTimers.ts`。
- ログインシェルを流すテストは `testing/quietShell.ts` を読み込む。一時フォルダは `testing/tempDir.ts`、Git は `testing/gitRepo.ts`、データは `@shared/foundation/testing/factories`。
