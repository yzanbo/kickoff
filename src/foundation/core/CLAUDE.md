# コアの土台（`src/foundation/core`）

Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）の、機能に依らない土台。組み立てと起動は `src/app/core/`（`startCore.ts`・コアのプロセス `hostMain.ts` → `hostRun.ts`・単体の `daemon.ts`）、機能のコア（ルート・表の店・サービス）は `src/features/<機能>/core/`。画面のコードは import しない（共有は `@shared/…`）。

## フォルダの役割

| フォルダ | 中身 |
|---|---|
| `kernel.ts`・`bus.ts`・`errors.ts`・`clock.ts`・`undo.ts` | 土台の束 `Kernel`（`createKernel`）・変更の知らせ `Bus`（`BusEvent`。SSE で配る）・失敗の型・時計 `Clock`（時間に頼る処理はこれを受け、`setTimeout`・`Date.now()` を直に書かない）・戻す手順 `Undo` |
| `host/` | メインとの `parentPort` 1 本の RPC（`rpc.ts`。形は `protocol.ts`）。メインにしかない口は `@/app/core/hostRemote.ts` |
| `db/`・`http/` | SQLite（`node:sqlite`）/ Hono の API・認証・SSE・画面の配信 |
| `aiTools/` | AI の操作ツールを出す MCP サーバー |
| `workplace/`・`files/` | 作業場所（git・ワークツリー・`carry.ts`・Git でないフォルダ）・ファイルの操作 `folderFiles` |
| `platform/` | OS ごとに違う処理の口 `HostPlatform`（機能だけの値は `@/app/core/platform.ts`）と macOS の中身（`macos/`）。DB ワーカーは `ShellPlatform` |
| `system/` | 外部コマンド・パス・`ttlCache.ts`・名前と保存先とポート `appEnv.ts`・開発版のデータの写し `devData.ts`・詰まりの見張り `stallWatch.ts` |
| `settings/`・`shell/`・`watch/`・`testing/` | 設定・秘密の値・Bash の文の区切り `shellWords.ts`・見張り（`Poller`・`Lease`）・テストの補助 |

- 機能は `feature.ts` の `CoreFeature`（`@/app/core/assemble.ts` が並べる）。`serve.ts` が待ち受けて `start` を作った順に呼び、止める順（`stopPhase: "first"` → 流れ続けている外部コマンド → 残りを作った順の逆 → `bus.flush` → HTTP → DB）も決める。
- 起動のとき、作業中のまま残ったチャットは未読の失敗にし、途中で止まった印のあるものを再開の確かめに渡す（`store.chats.recoverInterrupted`）。終わりの記録のない最後の作業には `endInterruptedTurns` が `result` を足す。
- `chat_delta` はほかの知らせより必ず先に流す（`@/features/chat/core/deltaStage.ts`）。知らせはすべて `Bus` を通し、`Bus` を通さずに SSE へ書かない（どの購読者から見ても順が同じ）。
- 子のプロセス（エージェントの CLI など）を起こしたら `system/childProcesses.ts` の `reportChildProcess` で知らせる（コアが落ちたらメインが止める）。
- 眠らせない理由（`@/app/core/hostRun.ts` の `awake`）は作業中は一定の間隔でも読み直す（理由は `AWAKE_RECHECK_MS`）。コアのプロセスの決まりは `src/foundation/desktop/CLAUDE.md` の「コアのプロセス」。
- 重い同期の処理は `stallWatch.ts` の `timed` / `noteSync` で名前を付ける（詰まりの記録に出る）。製品版と開発版は `APP_ENVS` の別の保存先とポートで同時に動く。

## DB（`db/`）

- スキーマは機能の `core/schema.ts`。版は `@/app/core/migrations.ts` の末尾に足す（既存は書き換えない）。版ごとに 1 つのトランザクション。
- 表はすべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON は `json_valid` と `json_type`。値の一覧は CHECK にしない。「ない」は NULL で、空文字を入れない列は `CHECK (x <> '')`。
- 版は `application_id`（'KICK'）と `user_version`（300 ＋ 版）。`inspectSchema` で、ほかのアプリ・新しすぎる版は触らずに（WAL にする前に）例外。
- 読み書きは表ごとの店（機能の `createX` が作る `core/db/<表>.ts`。chat は `chat.api.store`）を通し、ルートで SQL を書かない。変える操作は `onChange` で知らせる（秘密の値は知らせない）。
- 行と型の変換は、表の列の宣言（`db/table.ts` の `table()`。機能の `core/schema.ts`）か、まだ乗せていない店の `toChat`・`CHAT_COLUMNS` などに集める。
- `chats.active_at`（一覧の並び順）を進めるのは `status` を変える更新だけ（未読・固定・並び・名前・アーカイブ・移動・復旧では進めない）。
- ゴミ箱にあるチャットは `store.chats` の読み取り（`get`・一覧・子孫・検索・フィードなど）から外す。読み取りを足したらゴミ箱のものを外す。会話記録を残すか（`sessionInUse`）はゴミ箱のものも数える。
- 設定は `k.settings.get` が既定とまぜる（知らないキーは捨てる）。`update` は送ったキーだけ変え、中は丸ごと替える（`provider_chat_defaults` は AI ごと）。
- `meta` の `database_id` は DB を作ったときの ID（画面が ID 入りの保存を捨てる目印・スマホが本体を見分ける目印）。メインは SQL を流さない（DB の様子は chat の `stats()`）。

## HTTP（`http/`）

- ルートは機能の取り決め（`@shared/<機能>/contract.ts`）を `http/implement.ts` で受け `CoreFeature.routes` で出す（まだのものは `legacy`）。登録は `http/mount.ts`、順は `http/app.ts`。
- `:id` は `http/lookups.ts` のミドルウェア（`withProject` / `withWorkdir` など）で引き、`c.var` で受ける。作業場所の指定は `workplace/worktrees.ts` の `requireWorktree`、チャットのフォルダは `@/features/chat/core/workdir.ts` の `workdirOf`。
- 失敗は `errors.ts` の `Invalid` / `NotFound` / `Conflict` を投げ、`http/errorResponse.ts` が `{ error }` にする（外の SDK は `.catch(asInvalid)`）。包み直さない。作業中に断る操作は `runner.requireIdle`（409）。
- 本文は `http/input.ts` の `jsonBody`、クエリは `queryOf` で読み、zod で確かめる（共通の部品は `http/zodParts.ts`）。本文の型は `@shared/foundation/apiTypes.ts` に置き、zod は `satisfies` で合わせる。
- 送る指示（文・選択・添付）は、新しいチャット・続き・伝える・送信待ちで同じ形。応答は、変えたら変えたあとの資源・作ったら 201・待たずに始めたら 202・返すものがなければ 204。
- API・SSE の形は 1.0 から「足すだけ」にし、壊すなら `@shared/foundation/api/version` の `API_VERSION` を上げる。下限より古いアプリは認証より前に 426。
- SSE の JSON は `http/sseData.ts` の `sseDataOf` で知らせごとに 1 回だけ作る。つないだらすぐ hello を送る（書くまで応答ヘッダーが届かない）。`onAbort` は最初の `await` より前に登録する。
- SSE の種類は `@shared/<機能>/events.ts` に足す（端末に届けるなら `access: "device"`）。
- 図の枠のページ `/visual-frame` は画面の CSP を引き継がないよう別のページにする。画面の配信と HTTP サーバーの止め方は `src/foundation/desktop/CLAUDE.md`。

## 外部コマンドとパス（`system/`）

- 外部コマンドは `system/exec.ts` の `runCommand`（失敗の `CommandError` はそのまま投げれば 400）。`execFileAsync` を直接使わない。流れ続けるものだけ `system/stream.ts` の `streamCommand`（閉じるときに `stopAllStreams`）。
- git・gh は聞かれても待たない（`nonInteractiveEnv()`）。git は `workplace/git.ts`（remote に触るなら `k.workplace.git`）。
- OS ごとに違うコマンド・パスは `platform/` の `HostPlatform` に口を足して `platform/macos/` に書く（テストは口ごと偽物に）。
- ログインシェルの PATH の読み直しは裏で流し、待つのは外部コマンドを起こす所だけ（`shellPathSettled()`）。実行ファイルは `findExecutable(names, searchDirs())`。
- API・SSE・DB に出す相対パスの区切りはいつも「/」（`system/paths.ts` の `toApiPath`）。包含・`~`・リンクの解決も `system/paths.ts`。

## AI の操作ツール（`aiTools/`）

- AI に Kickoff を操作させるツール（`kickoff_browser`・`kickoff_db`・`kickoff_chat`）は、どの CLI からもつなげるコアの 1 つの MCP サーバーで出す。
- 定義は `aiTools/tool.ts` の `defineAiTool`（投げた失敗は理由の文の結果）。機能は組 `AiToolGroup`（`order` の順）を `CoreFeature.aiTools` で出す（chat の組は `chatTools.ts`）。中身の決まりは `src/features/chat/CLAUDE.md`。
- 実行ごとに `aiTools/registry.ts` の `AiToolRegistry` が組を開いてサーバーにし、`McpToolHost`（`aiTools/host.ts`）に登録して、終わったら（失敗でも）鍵を捨てる。
- 口は `/mcp/<名前>`（`/api/*` の認証の外）で、実行ごとの鍵だけを受ける（違えば見分けさせずに 401）。鍵は環境変数で渡さない（AI が Bash で読めないように）。
- `autoAllow` は `auto` のツール（承認と断りをツールの中で行うもの・読むだけのもの）。
- 権限モード・Auto mode によらず聞くもの（承認の要る `db_query`・「毎回聞く」の `create_chat`）は、ツールの中で `turn.ask`。
- 使い方とデータを信頼しないことは組の `instructions` で渡す。

## テスト

- コアのテストの DB はメモリ（`dbFile: ":memory:"`）で、外のネットワーク・本物の AI は呼ばない。
- 作ったもの（見張り・サーバー・子プロセス・DB ワーカー）は必ず止める（`setup()` の分は `afterTest` で機能の `stop`）。
- API のルートを変えたら、その機能の `core/routes/server.<領域>.test.ts` に足す（認証・SSE・配信は `@/app/core/server.test.ts`、端末は `server.devices.test.ts`）。
- 準備の補助: API は `@/app/core/testing/testServer.ts` の `setup()`（偽物は `testEnv.ts`）、`Runner` は `testCore.ts` の `setupCore` と `ScriptedProvider`（`@/features/ai/core/testing/fakeProvider.ts`）。前回のデータは `beforeStart`。
- 条件は `testing/until.ts` の `until(cond)` で待つ（2 秒。遅れうるものは `until(cond, ms)`）。決め打ちの時間で待ってから比べない。時計は `testing/manualClock.ts`。
- ログインシェルを流すテストは頭で `quietShell()`（`testing/quietShell.ts`）を呼ぶ。一時フォルダは `testing/tempDir.ts`、Git は `testing/gitRepo.ts`、データは `@shared/foundation/testing/factories`。
