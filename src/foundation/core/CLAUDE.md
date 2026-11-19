# コア（src/core）の説明
<!-- 行き先: src/foundation/core/ -->

Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）。Mac のアプリではメインが起こす別のプロセス（`utilityProcess`。入口 `host/`）で動き、`npm run daemon` の単体でも動く。画面のコードは import しない（共有は `@shared/…`）。チャットの実行は `chat/CLAUDE.md`、プロバイダーは `providers/CLAUDE.md`。

## フォルダの役割
<!-- 行き先: src/foundation/core/ -->

| フォルダ | 中身 |
|---|---|
| `index.ts` | `startCore` で組み立てて起動し、`close` で止める |
| `host/` | Mac のアプリのコアのプロセス（`main.ts` → `run.ts`）。メインとは `parentPort` 1 本の RPC（`rpc.ts`。形は `protocol.ts` の 1 か所）。メインにしかない口は `remote.ts` |
| `bus.ts` | 変更の知らせ `Bus`（`BusEvent`。SSE で配る） |
| `db/`・`http/` | SQLite（`node:sqlite`）/ Hono の API・認証・SSE・画面の配信 |
| `chat/`・`providers/` | チャットの実行 / AI の実行の口 `AgentProvider`（それぞれの `CLAUDE.md`） |
| `git/`・`worktrees/`・`github/` | Git・プロジェクトのフォルダ / ワークツリーの後始末 / GitHub タブと CI のタブ |
| `mcp/` | AI の操作ツールを出す MCP サーバー |
| `devices/`・`tailscale/` | スマホ連携のペアリング / Tailscale Serve の案内 |
| `userView/`・`browser/` | 利用者が見ているもの（メモリだけ）/ AI が埋め込みブラウザを操作する口（中身はメインの `main/browser/agentBrowser.ts`） |
| `platform/` | OS ごとに違う処理の口 `HostPlatform` と macOS の中身（`macos/`）。DB ワーカーは別の口 `ShellPlatform` |
| `system/` | 外部コマンド・パス・`ttlCache.ts`・名前と保存先とポート `appEnv.ts`・開発版のデータの写し `devData.ts`・詰まりの見張り `stallWatch.ts` |
| ほか | 下の同じ名前の節（`terminal/`・`worktreeEnv/`・`remoteImages/`・`ports/`・`trash/`・`notifications/`・`usage/`・`voice/`・`memos/`・`databases/`・`docker/`・`testing/`） |

- `close` は止める順を変えない（エージェント → 流れ続けている外部コマンド → 見張りとサービス → DB ワーカー → `bus.flushDeltas` → HTTP → DB。`close` の頭のコメント）。サービスを足したら止めるのも足す。
- 起動のとき、作業中のまま残ったチャットは未読の失敗にし、途中で止まった印のあるものを再開の確かめに渡す（`store.chats.recoverInterrupted`）。終わりの記録のない最後の作業には `endInterruptedTurns` が `result` を足す。
- `chat_delta` はほかの知らせより必ず先に流す（`chat/deltaBatch.ts`）。知らせはすべて `Bus` を通し、`Bus` を通さずに SSE へ書かない（どの購読者から見ても順が同じ）。
- 子のプロセス（エージェントの CLI・DB ワーカーの子・診断の `log`）を起こしたら `system/childProcesses.ts` の `reportChildProcess` で知らせる（コアが落ちたらメインが止める）。
- 眠らせない理由（`host/run.ts` の `awake`）は作業中の間は一定の間隔でも読み直す（作業の終わりの `chat` は作業中の数が減るより先に流れる）。コアのプロセスの決まりは `src/main/CLAUDE.md` の「コアのプロセス」。
- 重い同期の処理には `stallWatch.ts` の `timed` / `noteSync` で名前を付ける（詰まりの記録に出る）。製品版と開発版は `APP_ENVS` の別の保存先とポートで同時に動く。

## DB（db/）
<!-- 行き先: src/foundation/core/ -->

- スキーマは `db/schema.ts` の `MIGRATIONS` の末尾に足して変える（既存の要素は書き換えない）。版ごとに 1 つのトランザクション。
- 表はすべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON は `json_valid` と `json_type`。値の一覧は CHECK にしない。「ない」は NULL で、空文字を入れない列は `CHECK (x <> '')`。
- 版は `application_id`（'KICK'）と `user_version`（200 ＋ 版）。`inspectSchema` で、ほかのアプリ・新しすぎる版ならデータに触らずに（WAL にする前に）例外。
- 読み書きは `Store`（`db/store.ts`）の表ごとの店（`db/<表>.ts` の `createXxxStore(db, onChange)`）を通し、ルートで SQL を書かない。変える操作は `onChange` で知らせる（秘密の値は知らせない）。
- 行と型の変換は店の `toChat` などに集める（真偽値は `db/common.ts` の `bit()`）。変えられる列は `CHAT_COLUMNS` などの 1 つの一覧を、型と `updateRow` の両方に使う。
- `chats.active_at`（一覧の並び順）を進めるのは `status` を変える更新だけ（未読・固定・並び・名前・アーカイブ・移動・復旧では進めない）。
- ゴミ箱にあるチャットは `store.chats` の読み取り（`get`・一覧・子孫・検索・フィードなど）から外す。読み取りを足したらゴミ箱のものを外す。会話記録を残すか（`sessionInUse`）はゴミ箱のものも数える。
- 設定は `store.settings.get` が `DEFAULT_SETTINGS` とまぜる（知らないキーは返さない）。`update` は送ったキーだけを変え、キーの中（`chat_defaults` など）は丸ごと置き換える。
- 秘密の値は `secrets` の表に置き、設定・SSE・応答には保存したかだけを出す。
- `meta` の `database_id` は DB を作ったときの ID（画面が ID 入りの保存を捨てる目印・スマホが本体を見分ける目印）。メインは SQL を流さない（DB の様子は `db/stats.ts`）。

## HTTP（http/）
<!-- 行き先: src/foundation/core/ -->

- ルートは `http/routes/<領域>.ts` の `xxxRoutes(app, deps)` で、`http/server.ts` の `createApp` で登録する。登録の順（認証と `onError` のあと、SSE・API の 404・画面の配信の前）を崩さない。
- `:id` は `http/lookups.ts` のミドルウェア（`withProject` / `withChat` / `withWorkdir` など）で引き、`c.var` で受ける。作業場所の指定は `http/workdir.ts` の `requireWorktree`、チャットのフォルダは `chat/workdir.ts` の `workdirOf`。
- 失敗は `http/errors.ts` の `Invalid` / `NotFound` / `Conflict` を投げて伝える（`onError` が `{ error }` にする。外の SDK は `.catch(asInvalid)`）。包み直さない。作業中にできない操作は `runner.requireIdle`（409）。
- 本文は `http/input.ts` の `jsonBody`、クエリは `queryOf` で読み、zod で確かめる（共通の形は `routes/schemas.ts`）。本文の型は `@shared/types` の `api.ts` に置き、zod は `satisfies` で合わせる。
- 送る指示（文・選択・添付）は、新しいチャット・続き・伝える・送信待ちで同じ形。応答は、変えたら変えたあとの資源・作ったら 201・待たずに始めたら 202・返すものがなければ 204。
- API・SSE の形は 1.0 から「足すだけ」にし、壊すなら `@shared/api/version` の `API_VERSION` を上げる。下限より古いアプリは認証より前に 426。
- SSE の JSON は `http/sseData.ts` の `sseDataOf` で知らせごとに 1 回だけ作る。つないだらすぐ hello を送る（書くまで応答ヘッダーが届かない）。`onAbort` は最初の `await` より前に登録する。
- SSE の種類を足すときは `BusEvent` に足し、端末に届けるか（`deviceMaySee`）も決める。
- 図の枠のページ `/visual-frame` は画面の CSP を引き継がないよう別のページにする。画面の配信と HTTP サーバーの止め方は `src/main/CLAUDE.md`。

### チャットの記録の読み方（routes/chats.ts・chat/chatLogQuery.ts）
<!-- 行き先: src/features/chat/ -->

- `GET /api/chats/:id` の `tail_turns` はほかのクエリと一緒に使えない（400）。一部分の `GET …/events` は `ChatEventsQuery` の 5 つの形だけ。どちらもパソコンの画面だけ。
- 記録の ID は使い回さない。`after` の記録が巻き戻しで消えていれば `after_missing`（画面はすべて読み直す）。
- ターンの頭は `result` の直後で、自分の発言で数えない（作業中に伝えた発言で切ると、作業の終わりに付けるものが欠ける）。
- 索引は覆う索引の軽い形から `@shared/chat/chatIndex` の `selectIndexIds` で選ぶ（SQL に書き直さない）。覚え（`chat/chatIndexCache.ts`）は巻き戻し・付け替え・削除で `Store.logRevisions` を受けて捨てる。
- 詳細には書きかけの返答 `streaming_text` を入れる。あとに届く `chat_delta` は `offset` で、詳細に入っている分を捨てる。

### 端末とペアリング（http/caller.ts・deviceAccess.ts・devices/）
<!-- 行き先: src/features/devices/ -->

- 呼び主はトークンだけで決める（本体のトークン = この Mac、端末のトークン = hash で引いた端末、ほかは 401）。相手のアドレス・Tailscale の見出しは信じない。本体のトークンは画面の外に出さない。
- スマホ連携がオフなら、端末のトークンでも 403 `mobile_off`（つないでいる SSE も切る）。
- 端末が使えるのは `http/deviceAccess.ts` の `DEVICE_ROUTES` の口だけ（見るだけの端末は GET と `READ_ONLY_DEVICE_ROUTES`）。口を足す・名前を変えたら一覧も直す（`server.devices.test.ts`）。
- 端末の SSE には `deviceMaySee` の種類だけ届ける（`open_view`・`chat_draft` と閉じた口の知らせは届けない）。
- ペアリング（`devices/pairing.ts`）の番号と頼みはメモリだけ。端末のトークンは表に hash だけを置き、1 回だけ渡す。取り消したら SSE とターミナルの WebSocket もすぐ切る。Tailscale は案内だけ（`tailscale/status.ts`）。

## ターミナル（terminal/）
<!-- 行き先: src/features/terminal/ -->

- 内蔵ターミナルのシェルはコアで動かす（`sessions.ts` の `TerminalSessions`）。シェルは OS の口の `terminalShell`、ワークツリーの中なら `PORT` も渡す。
- `open` はあればつなぎ直していまの画面（`snapshot`）を返す。snapshot は書き終えるのを待ってから取り、取る間の出力は返したあとに送る（`output.ts`）。
- 持ち主は画面（`wc:<ID>`。画面が消えたらメインが `closeOwnedBy`）か端末か `host`。持ち主を替える口は、シェルがなければ始めずに 404（終わったコマンドを流し直さない）。
- WebSocket はターミナルの口だけ（`http/httpServer.ts` が `ws` を渡す）。見るだけの端末の入力は捨て、打てるかは送るたびに読み直す。テストは `http/server.terminals.test.ts`（`testing/fakeTerminal.ts`）。

## 外部コマンドとパス（system/）
<!-- 行き先: src/foundation/core/ -->

- 外部コマンドは `system/exec.ts` の `runCommand`（失敗の `CommandError` はそのまま投げれば 400）。`execFileAsync` を直接使わない。流れ続けるものだけ `system/stream.ts` の `streamCommand`（閉じるときに `stopAllStreams`）。
- git・gh は `nonInteractiveEnv()` で、聞かれたら待たずに失敗させる。git は `git/exec.ts` の `gitOutput` だけを通す。
- OS ごとに違うコマンド・パスは使う所に散らさず、`platform/` の `HostPlatform` に口を足して `platform/macos/` に書く（テストは口ごと偽物に）。
- ログインシェルの PATH の読み直しは裏で流し、待つのは外部コマンドを起こす所だけ（`shellPathSettled()`）。HTTP・DB・画面は待たない。実行ファイルは `findExecutable(names, searchDirs())`。
- API・SSE・DB に出す相対パスの区切りはいつも「/」（`system/paths.ts` の `toApiPath`）。包含・`~`・リンクの解決も `system/paths.ts`。

## Git（git/）
<!-- 行き先: src/features/git/ -->

- 入口は `git/index.ts`（状態 `status.ts`・ファイル `files.ts`・検索と置換 `search.ts`・差分とコミット `changes.ts`・`blame.ts`・`history.ts`・ブランチの操作 `branches.ts`・プロジェクトの作成と取り込み `workspace.ts`）。
- ファイルのパスは `assertInside` でリポジトリの外を断る。保存は開いたときの指紋と比べ、ほかで変わっていれば 409。消すのは Kickoff のゴミ箱へ。
- ブランチ・タグの名前は「-」で始まるものを断る。マージ・リベース・プルは衝突で止まっても失敗にせず、衝突したファイルを返す。
- Git で管理していないプロジェクト（`repo: false`）のファイルの一覧と検索は `git/plainFolder.ts`（フォルダの中に何も作らない）。ワークツリー・差分・履歴は 400。
- リポジトリの中のフォルダを本体にしたプロジェクト（`gitPrefix`）は、そのフォルダから見たパスで返す。コミットは、外にもステージしたファイルがあれば 409。
- 取り込みとフォルダの変更は `prepareImportedWorkspace` の決まり。登録済みかは実体のパスでも比べる（`projectAt`）。フォルダを変えたら、チャットは `Runner.moveWorkplace` で移す（`chat/CLAUDE.md` の「作業場所を移す」）。
- プロジェクトの GitHub のアカウントは `runAsGitHubAccount` の中で gh・git に渡す（引き当てのミドルウェアが包むので、ルートで渡さない。gh の有効なアカウントは切り替えない）。
- GitHub として扱うホストは `git/githubTarget.ts` の `GITHUB_HOSTS` だけ（Enterprise を足すときに直す所はその JSDoc）。

### ワークツリー（git/worktrees.ts・worktrees/）
<!-- 行き先: src/features/worktrees/ -->

- 置き場所は一番上の隣の `<名前>-worktrees/<ブランチ>`。`GitWorktree` の `root` は一番上、`path` は作業するフォルダ（チャットの `worktree_path` はこちら。一番上へ戻すのはコアの中だけ）。
- 作ったら `prepareWorktree` が無視しているもの（`node_modules` など）を APFS の複製で写し、`onCreated` で実行環境を整える。作る道（API・新しいチャット・PR・CI）はどれも同じ口を渡す。
- 一覧を返す API は `routes/worktrees.ts` の `present` を通して実行環境と色（`worktrees/colors.ts`）を付ける。
- 消すのは画面も AI も `worktrees/finish.ts` の `WorktreeFinisher`。失うものは Git の控え（`worktrees/backup.ts`）に入れてゴミ箱に残し、チャットは `Runner.moveWorkplace` で本体へ移す（同じリポジトリのほかのプロジェクトも見る = `usersOf`）。
- 片付けを予約したワークツリーは移す先にできない（`reservedFolders`）。Git でないフォルダの一覧は空で返す（失敗にすると画面が取り直し続ける）。
- ブランチの切り替え・足し引きは `git/headWatch.ts` が Git のフォルダを見張って `worktrees_changed` を出す。

### GitHub タブ・CI のタブ（github/・git/prWatch.ts）
<!-- 行き先: src/features/github/ -->

- `GitHubService` が連携先にプロジェクトのアカウントで `gh api` を呼ぶ（`ghApi.ts`。問い合わせ `queries.ts`・形の変換は純粋な `normalize.ts`）。CI の `CiService`（`ci.ts`・`ciNormalize.ts`）も同じ口。
- `gh api` の文字の変数は `-f`、数は `-F`（`-F` は `@` で始まる値をファイルとして読む）。REST の書き込みの本文は一時ファイルから渡す（`send`）。
- 中身は DB に持たない（一覧は ETag で聞き直す。gh は 304 で終わり値 1 なので状態の行で見分ける）。書いたらそのプロジェクトの覚えを捨てる。本文の画像は連携先のリポジトリの中だけを取る。
- PR の見張り（`WorktreePrWatch`）は同じ合図で CI の失敗も見る。GitHub の項目・`ci_watch`・アーカイブを変えたら `prWatch.checkProject` で聞き直す。
- GitHub・CI の口は端末に開かない。テストは `setup()` の `ghFake`（`server.github.test.ts`・`server.ci.test.ts`）。

## AI の操作ツール（mcp/）
<!-- 行き先: src/foundation/core/ -->

- AI に Kickoff を操作させるツール（`kickoff_browser`・`kickoff_db`・`kickoff_chat`）は、どの CLI からもつなげるコアの 1 つの MCP サーバーで出す。
- 定義は `tool.ts` の `defineTool`。ここは引数の形・失敗の文・承認の聞き方だけで、中身は `chat/` の `ai…`・`databases/aiTools.ts`・`browser/`。結果の形は `chatToolResult.ts`。
- 実行ごとに `turnTools.ts` がサーバーを作って `McpToolHost`（`host.ts`）に登録し、終わったら（失敗でも）鍵を捨てる。
- 口は `/mcp/<名前>`（`/api/*` の認証の外）で、実行ごとの鍵だけを受ける（違えば見分けさせずに 401）。鍵は環境変数で渡さない（AI が Bash で読めないように）。
- `autoAllow` には、承認と断りをツールの中で行うものと読むだけのものだけを入れる（名前は `mcp__kickoff_chat__` の頭を外す）。
- 権限モード・Auto mode によらず聞くもの（承認の要る `db_query`・「毎回聞く」の `create_chat`）は、ツールの中で `requestApproval`。
- 使い方とデータを信頼しないことは `instructions` で渡す。ツールを足したら `ChatTools`・`instructions`・`autoAllow`・`mcp/turnTools.test.ts` も直す。
- 作業の初めにブラウザのタブを使うときは 1 回だけ欄を表に出す（`browserReveal.ts`。Auto mode では承認カードが出ないため）。
- 砂場の拒否の診断（`chatDiagnosticTools.ts`）は生の本文・パス・コマンドラインとほかのチャットのログを返さない。砂場の設定は変えない。

## ワークツリーの実行環境（worktreeEnv/）
<!-- 行き先: src/features/worktrees/ -->

- ワークツリーごとにポートの帯と Docker の組の名前を分ける（`service.ts` の `WorktreeEnvService`）。決めるのは作るときだけで、書くのは Git で管理していないファイルだけ。
- `prepare` は `.env` を写す → 帯を選ぶ（`bands.ts`）→ compose に聞いて番号を並べる → `.env` の Kickoff の区切り（`envRewrite.ts`）と上書きファイル → 接続先の書き換え。
- Git で管理している `.env` があれば何も書かずに `blocked`。途中で失敗してもワークツリーの作成は失敗させない。チャットの AI と内蔵ターミナルには `PORT` を渡す（`envFor`）。
- ［AI で整える］は `untrackedOnly` のチャットで始める（`chat/CLAUDE.md` の「書き込みの守り」）。テストは `http/server.worktreeEnv.test.ts`・`chat/guard/scope.test.ts`。

## 外の画像（remoteImages/）
<!-- 行き先: src/features/remoteImages/ -->

- 返答の外の画像は、利用者が許可したホストのものだけをコアが代わりに取る（画面の CSP の `img-src` は開けない）。許可はチャットごとに DB。
- `fetchImage.ts` は手元・社内の宛先（`addresses.ts`）を断り、つなぐときも確かめた宛先を使う（名前の引き直しで変えさせない）。転送のたびに確かめ直す。口は端末に開かない。
- 取った画像（`service.ts`）は分岐で `copyChat`、チャットを本当に消すときに `forgetChats`。

## ポートを使っているプロセス（ports/）
<!-- 行き先: src/features/ports/ -->

- プロジェクトのフォルダでポートを待っているプロセスを調べる・止める（`PortProcessService`。DB には持たない。OS の読み取りは `ProcessProbe`）。
- Kickoff 自身（Helper も）とその祖先は出さず、止めさせない。止めるのは、調べ直して `command_full` が同じものだけ。
- 調べるのは頼まれたとき・止めたあと・作業の終わりだけ（`watch.ts`）。一覧はコマンドの全文を含むので SSE に載せず、口も端末に開かない。テストは `http/server.ports.test.ts`（`portsFake`）。

## ゴミ箱（trash/）
<!-- 行き先: src/features/trash/ -->

- 消したものを 3 日取っておく Kickoff のゴミ箱（`service.ts` の `TrashService`。OS のゴミ箱とは別）。覚え書きは表 `trash_items`。
- 入れるのは `putPath`（ファイルを移す）か `addRecord`（チャット・プロジェクトなど）。入れた時刻は片付けと同じサービスの時計で付ける。
- 種類ごとの戻す・消すは `register(kind, …)`（`chatTrash.ts`・`projectTrash.ts`・`worktrees/finish.ts`）。本当に消すのは `sweep` も `purgeNow` も同じ `purge` を通す。片付けの途中に頼まれたら、終わってからもう一度流す。
- AI の kickoff-trash（`command.ts`）は自分で置き場に書き、`importInbox` が取り込む（守りは `chat/CLAUDE.md` の「書き込みの守り」）。
- チャット・プロジェクトは行を残して読み取りから外すだけ。本当に消すとき（`purgeChatsOf`）は、行を消す前に会話記録と添付の候補を集め、消したあとで使われていないものだけを消す。
- 会話記録を片付ける前に、ほかの Kickoff の DB も使っていないか確かめる（`siblingSessions.ts`。製品版と開発版は同じ `~/.claude/projects`）。使っていない会話記録は自動では消さない。
- 同じフォルダのプロジェクトがゴミ箱にあるうちは、作る・取り込む・フォルダの変更を 409。口は端末に開かない。テストは `http/server.trash.test.ts`（`trashBin`・`trashClock`）。

## 通知（notifications/）
<!-- 行き先: src/features/notifications/ -->

- 完了・失敗・回答待ち・AI からの知らせ・CI の失敗を、見ていない人にだけ知らせる判断はコアの 1 か所（`center.ts`。スマホへのプッシュも同じ判断）。
- 見ているかは呼び主ごとの `PUT /api/viewing`（`viewing.ts`）。この Mac で見ていても、見ていない端末には送る。
- 文は純粋な `notices.ts`。プッシュの文はチャットの名前と状態だけ（中身・失敗の理由を載せない）。Expo Push（`expoPush.ts`）はアクセストークンを付けない。1 つが送れなくても、ほかは止めない。

## 使用状況（usage/）
<!-- 行き先: src/features/ai/ -->

- Claude のプランの使用枠は `planUsage.ts` の `UsageMonitor`（メッセージを送らないので枠を使わない）。Codex のクレジットは `codexCredits.ts`。
- サービスごと（`services/`）は 1 ファイルずつ `defineFetcher` で作り、1 つが失敗・遅れても、ほかは出す（`services.test.ts`）。覚える時間は画面の取り直しと同じ `USAGE_REFRESH_MS`。
- 各サービスのログイン情報は読むだけで更新しない（更新するとその CLI のログインが切れる）。名乗りは `USER_AGENT`（ほかのアプリのふりをしない）。

## 音声入力（voice/）
<!-- 行き先: src/features/voice/ -->

- `service.ts` の `VoiceService` が設定の `voice_provider` で `local`（`whisper-cli`＋`ffmpeg`。一時フォルダは必ず消す）/ `macos`（OS の口の `speech`）/ `openai` に振り分ける。
- macOS は補助コマンド `kickoff-speech`（`native/kickoff-speech/main.swift`）。WebM は `webmToOgg.ts` で Ogg に詰め替える。準備の確かめは `readiness.ts`。
- テストは `engines` / `findTools` / `speech` / `fetch` を差し替える（`http/server.voice.test.ts`）。

## メモ（memos/）
<!-- 行き先: src/features/notes/ -->

- メモはプロジェクトの外のフォルダの Markdown と HTML（DB に入れない）。フォルダは `MemoService.dirOf`。画面は `features/memo/CLAUDE.md`。
- パスはメモのフォルダからの相対で受け、`assertInside` で外を断る。「.」で始まる名前は扱わない。読み書きはファイルと同じ口（指紋で 409）。
- 変えたら SSE の `memos`。外の変更は `memoWatcher.ts` が知らせる（重なって届くので、画面は指紋で読み直しを省く）。
- メモの名前を変える・動かすと、メモのチャットと DB の手順メモを `remapMemoPath` で付け替える。ゴミ箱に入れると、メモのチャットも同じ行に入れる（`trashMemoChats`。kickoff-trash でも）。
- メモのフォルダは、どのチャットでも実行のときに書ける場所に足し、システムプロンプトで伝える（`buildTurnParams`）。AI にパスを渡すときは区切りが分かる形にする。
- HTML のメモが読むファイルは `http/assets.ts` の `assetResponse`（`sandbox` の CSP）。テストは `http/server.memos.test.ts`（`memoFake`）。

## DB クライアント（databases/）
<!-- 行き先: src/features/database/ -->

- 接続は表 `db_connections`。パスワードは `secrets` に、いつも `safeStorage` で暗号化して置く（`databases/secrets.ts` の `DbSecretVault`）。応答は `has_password` などだけ。画面は `features/database/CLAUDE.md`。
- キーチェーンで開けなければ 409 `db_password_locked`。DB タブはその場で聞いてメモリにだけ持ち、AI のツールは失敗にする。口はどれも端末に開かない。
- Kickoff の保存先（製品版・開発版の両方）の中の SQLite は、実体のパスで比べて断る。
- DB に触るのは別のプロセスの DB ワーカー（`client.ts` の `DbWorkerClient`。Electron ではメインが起こし MessagePort で直結）。重い SQL・止まった DB がコアの HTTP と SSE を止めないため。
- コアはドライバと `yaml` を読み込まない（`inProcessWorker.ts` を `client.ts` から import しない。ドライバはワーカーの中で使うときに `import()`）。ssh・シェルは `worker/children.ts` の `spawnTracked` で起こす。
- 同じ接続の名前（`shared:` / `sql:` など）への頼みは `handler.ts` の `serial` で 1 つずつ流す（並べると接続を二重に開く）。
- 読み取り専用は 2 段（文の判定 `@shared/database/sqlStatements.ts` と DB 側。SQLite は ATTACH も断る）。SQL は 1 回に 1 文だけ受ける。
- 絞り込み・行の変更の SQL は共有の `dbFilter.ts` / `dbEdit.ts` が組み立てる（値はいつも params。WHERE の式は `assertWhere`）。行の変更は 1 つのトランザクションで、1 行に当たらなければすべて取り消す。
- AI の SQL（`DatabaseService.aiQuery`）は読み取りの 1 文だけ → 承認 → DB 側も読み取り専用・呼び出しごとの新しい接続 → 手元と DB 側の時間の上限 → 作業を止めたら止める。
- AI の結果は頭の行だけを返し、多ければ OS の一時フォルダに CSV（`aiExports.ts`）。返す文は `aiFormat.ts`（接続の情報を出さない・`<db_data>` で包む）。つなぐときにコマンドを流す接続は AI からつながない。
- 準備のコマンド（`prep`）は確かめるまで流さない。止めるときは子孫ごと止め、後片付けは接続を消した・自動で切れた・ワーカーを止めるときに流す。
- SSH トンネル（`worker/tunnel.ts`）はパスワードをファイルに書かず、同じ踏み台・同じ DB は 1 本を使い回す。known_hosts に足すのは画面で見せた指紋と合うときだけ（`sshHostKey.ts`）。
- テストは `http/server.databases.test.ts`（`inProcessWorker.ts`）・`databases/aiTools.test.ts`。PostgreSQL・MySQL・MariaDB は `worker/drivers.dbtest.ts` を `npm run test:db`（Docker。`npm test` に入れない）。

## Docker タブ（docker/）
<!-- 行き先: src/features/docker/ -->

- compose のサービスを見て操作する（エンジンは管理せず `docker` コマンドだけ。DB は使わない）。呼び方は `cli.ts` の `DockerCli`。画面は `features/docker/CLAUDE.md`。
- compose の設定は compose 自身に聞く（YAML を読まない。覚えは `ComposeConfigCache`）。一覧の見出しは純粋な `listing.ts`、どのプロジェクトかは `working_dir` の `deepestWorkplace`。
- 操作のコマンドは純粋な `actions.ts` の `planDockerAction`。停止・再起動・片付けは `-p` だけで `/` から流す（ファイルのあるフォルダで流すと札付きが残る）。片付けに `-v` は付けない。
- 操作は compose ごとに 1 つずつ（取り直す前に予約し、2 つ目は 409）。up は時間で打ち切らず［中止］で止める。ポートの取り合いで相手を止めたら、ぶつかったサービスは `--force-recreate` で作り直す（理由は `actions.ts`）。
- docker events は画面の貸し出しの間だけ流す。ログは保存しない。AI の守りが見る様子（`guardFacts.ts`）は時間で打ち切り、答えなければ通す側に倒す。
- 口は端末に開かない。テストは `server.docker.test.ts`・`server.dockerDb.test.ts`（`dockerFake`）・`docker/actions.test.ts`。

## テスト
<!-- 行き先: src/foundation/core/ -->

- コアのテストの DB はメモリ（`new Store(":memory:")`）で、外のネットワーク・本物の AI は呼ばない。
- 作ったもの（見張り・サーバー・子プロセス・DB ワーカー）は必ず止める（`setup()` の分は `afterTest`。足したら止めるのも足す）。
- API のルートを変えたら、その領域の `http/server.<領域>.test.ts` に足す（認証・SSE・配信は `server.test.ts`、端末は `server.devices.test.ts`）。
- 準備は `testing/` の補助: API は `testServer.ts` の `setup()`、`Runner` は `testCore.ts` の `setupCore` と `fakeProvider.ts` の `ScriptedProvider`。前回の起動のデータは `beforeStart` で入れる。
- 条件は `until(cond)` で待つ（2 秒。遅れうるものは `until(cond, ms)`）。決め打ちの時間で待ってから比べない。時計は `testing/fakeTimers.ts`。
- ログインシェルを流すテストは `testing/quietShell.ts` を読み込む。一時フォルダは `testing/tempDir.ts`、Git は `testing/gitRepo.ts`、データは `@shared/testing/factories`。
