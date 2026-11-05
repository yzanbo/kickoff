# コア（src/core）の説明

Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）。メインプロセスの中でも、`npm run daemon`（`daemon.ts`。保存先とポートは開発版のもの）の単体でも動く。画面と共有する型と純粋な関数は `src/shared`（`@shared/…`）に置き、画面（renderer）のコードは import しない。チャットの実行は `chat/CLAUDE.md`、プロバイダーは `providers/CLAUDE.md`。

## フォルダの役割

- `index.ts`: `startCore` で組み立てて起動し、`close` で止める（実行中のエージェント → 音声のダウンロード → 使用枠 → 自動のアーカイブ → HTTP → DB）。起動のときに、リリース前の保存データを消し（`discardPrereleaseData`）、前回の終了で作業中のまま残ったチャットを未読の失敗にする（`store.chats.recoverInterrupted`）。
- `bus.ts`: 変更の知らせ `Bus`（`@shared/types` の `BusEvent`。SSE で配る）。
- `db/`: SQLite（`node:sqlite`）。→「DB」
- `http/`: Hono の API・認証・SSE・画面の配信。→「HTTP」
- `chat/`: チャットの実行（受付の `Runner`・1 回の実行・送信待ち・止まったあとの再開・承認・分岐と巻き戻し・書き込みの守り・添付）。→ `chat/CLAUDE.md`
- `providers/`: エージェントの実行基盤の抽象（`AgentProvider`）と Claude Code の実装。→ `providers/CLAUDE.md`
- `git/`: Git・GitHub（gh）・プロジェクトのフォルダの作成と取り込み・ワークツリー。→「Git」
- `usage/`: Claude のプランの使用枠と、ほかのサービスの使用状況。→「使用状況」
- `voice/`: 音声入力の文字起こし。→「音声入力」
- `memos/`: プロジェクトのメモ（`memos.ts` の `MemoService`）。→「メモ」
- `system/`: 外部コマンド・パス（→「外部コマンドとパス」）・ログインシェルの PATH（`shellEnv.ts` の `loadLoginShellPath`）・期限付きのキャッシュ（`ttlCache.ts`）・名前と保存先とポート（`appEnv.ts` の `APP_ENVS`。製品版 Kickoff = 4317、開発版 Kickoff Dev = 4318。同時に動かせ、開発中の変更で製品版のデータを壊さない）・開発版のデータの写し（`devData.ts` の `seedDevData`。開発の保存先がなければ製品版から一度だけ。DB は `VACUUM INTO`）。
- `testing/`: テストからだけ使う補助。→「テスト」

## DB（db/）

- スキーマは `db/schema.ts` の `MIGRATIONS` に追記して変える（既存の要素は書き換えない。v1 は `SCHEMA_V1`）。版ごとに 1 つのトランザクションで流す。
- 表はすべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON の列は `CHECK (json_valid(x) AND json_type(x) = 'object')`（配列なら `'array'`）。値の一覧（状態・権限モードなど）は CHECK にしない（増やすたびに表を作り直すことになるため）。「ない」は NULL で、空文字を入れない列は `CHECK (x <> '')`（`worktree_path` が NULL なら本体）。
- 版は `PRAGMA application_id`（`APPLICATION_ID` = 'KICK'）と `user_version`（`USER_VERSION_BASE` の 200 ＋ 版。v1 = 201）で持つ。触る前に `inspectSchema` で調べ、Kickoff のものでない・このアプリより新しい版なら、データに触らずに例外にする。
- リリース前の系統（印が KICK で `user_version` が 100 ＋ 版）は引き継がない。起動のときに `db/open.ts` の `discardPrereleaseData` が DB（`-wal`・`-shm` も）・`backups/`・`uploads/` を消し、空の DB から作る（音声のモデル・トークンなど DB に依らないものは残す）。`openDatabase` はリリース前の DB を開かない。古い DB を変換する仕組みは作らない。
- `openDatabase` は WAL と外部キーを有効にしてから `migrate` する。
- `Store`（`db/store.ts`）は表ごとの店をまとめて持つだけ: `store.settings` / `secrets` / `projects` / `groups` / `chats` / `events` / `queues`。各店は `db/<表>.ts` の `createXxxStore(db, onChange)` で、変える操作は `onChange` で知らせる（SSE の起点。秘密の値は知らせず、送信待ちの知らせは `ChatRuntime` が出す）。ルートなどから SQL を書かず、店を直接使う。作るときの入力の形は `db/types.ts`（`NewProject` / `NewChat`）。
- 行と型の変換は各店の `toChat` / `toProject` などに集める（真偽値は `db/common.ts` の `bit()` で 0 / 1、JSON の列は読み書きのときに変換）。型と API は boolean で返す。変えられる列の一覧（`CHAT_COLUMNS` / `PROJECT_COLUMNS`）を型と UPDATE の両方に使い、`updateRow` で書いた項目だけを変える。
- `chats.active_at`（最後に動いた時刻。一覧の並び順）を進めるのは、状態（`status`）を変える更新だけ（`chats.update` に `status` があるとき = 送った・終わった）。未読・固定・グループ（`setUnread` / `setPinned` / `setGroup`）・名前・アーカイブ・移動・作業場所の片付け・起動のときの復旧では進めない。
- チャットを入れられるのは同じプロジェクトのグループだけ（トリガーで守る）。色（`hue`）はプロジェクトもグループも、作ったときに `@shared/project/colors` の `pickProjectHue` でほかと被らない色を選ぶ（グループは同じプロジェクトの中で）。
- 全文検索: `chat_events` の生成列 `text`（自分の発言とメインの AI の返答。サブエージェントの文は除く）を、ビュー `chat_event_texts` を中身にした FTS5（trigram）の `chat_event_search` にし、トリガーで追従させる。`store.events.search` は 3 文字以上を MATCH、2 文字以下を生成列の LIKE で探す。
- 設定はキーごとの JSON（`store.settings.get` が `DEFAULT_SETTINGS` とマージし、知らないキーは返さない。`update` は送った項目だけで、`chat_defaults` は丸ごと置き換える）。
- 秘密の値（API キーなど）は `secrets` の表（`store.secrets.get` / `set`。名前は `SecretKey`）。設定・SSE・API の応答には出さず、保存したかだけを返す。
- `meta` の `database_id` は DB を作ったときに決める ID。`/api/status` で返し、画面は DB を作り直したら ID 入りの表示の状態を捨てる目印にする。
- 性能の記録に載せる DB の様子は `db/stats.ts`（`Store.stats()` → `Core.databaseStats()`。メインプロセスは SQL を流さない）。

## HTTP（http/）

- ルートは `http/routes/<領域>.ts` に `xxxRoutes(app, deps)`（`deps` は `ServerDeps`）として書き、`http/server.ts` の `createApp` で登録する。登録は認証のミドルウェア（`/api/*`）と `onError` より後、SSE・知らない API の JSON の 404・画面の配信より前で、いまの順を崩さない。チャットの資源（一覧・作成・詳細・変更・既読・別のプロジェクトへの移動・削除・検索）は `chats.ts`、実行（送る・伝える・止める・圧縮・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し）は `turns.ts`、送信待ちは `queue.ts`、回答待ちは `approvals.ts`、添付とほかのチャットの記録は `uploads.ts`、Git は `git.ts`（状態・差分・操作・履歴・PR）/ `files.ts`（ファイルの一覧・中身・検索・保存）/ `worktrees.ts`、メモは `memos.ts`。
- URL の `:id` は `http/lookups.ts` の `lookups(store)` が返すミドルウェアで引き当て、ハンドラーは `c.var` で受ける（`withProject` / `withChat` / `withGroup`。Git・ファイル・検索・/ のコマンドは、操作するフォルダも `c.var.workdir` に入れる `withWorkdir`）。番号でなければ 400（`idParam`）、なければ 404。ルートごとに引き当てと検証を書かない。ID で引くのは `requireProject`、ほかのプロジェクトのグループを断るのは `requireGroupOf`（400）。
- 作業場所の指定（`?worktree=`・新しいチャットの `worktree_path`）は `http/workdir.ts` の `requireWorktree(repo, worktree)` で解決する（null = 本体 / このプロジェクトのワークツリーでなければ 400 / フォルダが消えていれば 404）。チャットの作業場所のフォルダは `chat/workdir.ts` の `workdirOf`。
- 失敗は例外で伝える。ドメインのコード（`chat/`・`git/`・`voice/` なども）は `http/errors.ts` の `Invalid`（400）/ `NotFound`（404）/ `Conflict`（409）を投げ、`onError` が `errorResponse` で `{ error }` にする。zod の失敗は 400（`issues` 付き）、外部コマンドの `CommandError` はその文のまま 400、知らない失敗は 500（記録する）。外の SDK の失敗は `.catch(asInvalid)` で 400 にする。ルートで boolean を受けて 404 にしたり、例外を包み直したりしない。作業中にできない操作は `runner.requireIdle(chatId, "削除")` のように 409 にする。
- 入力: JSON の本文は `http/input.ts` の `jsonBody`（空なら {}、JSON でなければ 400）だけで読み、クエリは `queryOf`。形は zod の `parse` で確かめ（失敗の 400 は `onError` に任せる）、共通の形と上限は `routes/schemas.ts`（`optionalId` / `repoPath` / `folderPath` / `flag` / `branchName` / `groupName` / `projectName` / `queueId` / `chatOptionsSchema` / `attachmentsSchema` / `messageText` など）。送る指示（文・選択・添付。文が空でも添付があれば送れる）は、新しいチャット・続き・止めずに伝える・送信待ちで同じ形にする（`newChatSchema` / `messageInputSchema` / `queueMessageSchema`）。本文の型は `@shared/types` の `api.ts`（`…Body`）に置き、zod は `satisfies z.ZodType<…>` で合わせる。
- 応答: 変えたら、変えたあとの資源（チャット・プロジェクト・グループ。並べ替えは一覧）を返す。作ったら 201、待たずに始めたら 202。削除と、様子が変わるだけで返すものがない操作（止める・自動の再開をやめる・回答する）は 204（変わった様子は SSE で届く）。送信待ちを変える API はどれも、変えたあとの `QueueState`。Git の操作は `gitAction` で操作のあとの状態を返す。API にだけ出る応答の形も `api.ts`。
- 認証はトークン（保存先の `token`。`loadOrCreateToken`）を Cookie（`kickoff_token`）か `Authorization: Bearer` で受ける。スマホは `/pair?token=` で Cookie に移す。
- SSE（`GET /api/events`）は `Bus` の知らせを JSON で送る。つないだらすぐ最初の行（ping）を送る（書くまで応答ヘッダーが届かず、画面が「接続中」のままになる）。切断の知らせ（`onAbort`）は最初の `await` より前に登録する。知らせの出どころ: DB の変更は各店の `onChange`、作業中の様子は `ChatRuntimes` の `chat_live`（変わるたびに丸ごと）、返答の途中経過 `chat_delta`・サブエージェントの途中経過 `chat_subagent`・実行中のコマンドの出力 `chat_command_output`（保存しない）、回答待ちは `ApprovalCenter`、使用枠は `UsageMonitor`、音声のモデルのダウンロードは `VoiceService`。種類を足すときは `BusEvent` に足す。
- 製品版の画面の配信（`Cache-Control: no-cache`・拡張子のあるパスは 404）と、HTTP サーバーの止め方（`stopHttpServer`）の決まりは `src/main/CLAUDE.md`。

## 外部コマンドとパス（system/）

- コアの外部コマンドは `system/exec.ts` の `runCommand(file, args, opts)` で動かす（標準出力を返す。失敗は `CommandError` で、文は標準エラー、なければ元の例外の文。`okCodes` の終了コードは失敗にしない。標準出力の上限は既定 20MB）。コアで `execFileAsync` を直接使わない。`CommandError` はそのまま投げれば 400 になる。
- 認証などを聞かれても答えられないので、git・gh は `nonInteractiveEnv()` で待たずに失敗させる。git は `git/exec.ts` の `gitOutput` だけを通す。
- 実行ファイルは `findExecutable(names, searchDirs())` で探す（PATH の順 → `/opt/homebrew/bin` → `/usr/local/bin` → `~/.local/bin`。Finder から起動してログインシェルの PATH を取り込めなかったときの補い）。
- パスの包含判定・`~` の展開・リンクの解決は `system/paths.ts`（`isInside` / `expandHome` / `realPathLoose`）、期限付きのキャッシュは `ttlCache`（モデル・/ のコマンドの一覧）。例外の文は `@shared/errors` の `errorMessage`。

## Git（git/）

- 入口は `git/index.ts`。`status.ts`（状態・いまのブランチ・リモート・`hasRef`。HEAD がなければまだコミットがない）/ `files.ts`（一覧・読む・保存・検索。パスは `assertInside` でリポジトリの外を断る。保存は開いたときの指紋と比べ、ほかで変わっていれば 409）/ `changes.ts`（差分・ステージ・コミット・プッシュ（追いかけるブランチがなければ origin に公開）・プル（早送りだけ）・フェッチ）/ `history.ts`（履歴・コミットの詳細・参照の一覧）/ `worktrees.ts` / `github.ts`（gh の状態と PR）/ `workspace.ts`（新しいプロジェクト・取り込むフォルダ。ワークツリーにはコミットが要るので、最初のコミットまで作る）。
- ワークツリーはリポジトリの隣の `<名前>-worktrees/<ブランチ>`（`worktreePathFor`。`/` は `-`）。作ったら `worktreeSetup.ts` の `prepareWorktree` が、本体の Git で無視しているもの（`node_modules` など）を APFS の複製（`cp -c`）で写す（本物のフォルダなので、ワークツリーで `npm install` しても本体は変わらない。写せなくても作成は失敗させない）。
- ワークツリーを消す（`POST /api/projects/:id/git/worktrees/remove`）ときは、そこで作業中のチャットがあれば 409。消えたら、そこで作業していたチャットの作業場所を本体に戻す（`store.chats.clearWorktree`）。`delete_branch` でブランチも消す（PR がマージされたあとの片付け）。消す前の確かめは `worktreeRemovalInfo`。Git で管理していないフォルダのワークツリーの一覧は空で返す（失敗にすると画面が取り直し続ける）。

## 使用状況（usage/）

- `planUsage.ts` の `UsageMonitor`: Claude のプランの使用枠を 5 分ごとと実行のあとに取り（`provider.usage()`。メッセージを送らないので枠を使わない。15 秒以内の続けての取得はまとめる）、SSE の `usage` で配る。
- `services/`: 設定の「使用状況」のサービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）。`ServiceUsageMonitor` が 5 分覚え、Claude は `UsageMonitor` の値を使う。1 サービス 1 ファイルの `UsageFetcher` を `defineFetcher` で作り、結果は `usageResult(base)` の `ok` / `unavailable` / `error`、HTTP の状態コードの振り分けは `fetchJsonOr`、応答の変換は `parseXxx`（`services.test.ts` でテストする）。1 つが失敗・遅れても、ほかは出す。
- 各サービスのログイン情報は読むだけで、更新・書き換えをしない（更新用のトークンを使うと、そのサービスの CLI のログインが切れる）。期限切れは、そのサービスを起動するよう案内する。

## 音声入力（voice/）

- 入口は `service.ts` の `VoiceService`。設定の `voice_provider` で振り分ける: `local` = Homebrew の `whisper-cli`（whisper-cpp）＋ `ffmpeg`（`tools.ts` の `findVoiceTools`）。`local.ts` で 16kHz・モノラルの wav にしてから起こし、一時フォルダは必ず消す / `openai` = `POST {Base URL}/audio/transcriptions`（`openai.ts`。Base URL が空なら OpenAI）。
- 準備の確かめは `readiness.ts` の `voiceUnreadyReason`（できなければその理由で 400）、モデルの一覧は `models.ts` の `WHISPER_MODELS`（ggml。保存先の `models/ggml-<id>.bin`。開発版と製品版で別）、ダウンロードは `downloads.ts` の `ModelDownloads`（`.part` に書いて名前を変える。進み具合は SSE の `voice_model`）。
- API は `http/routes/voice.ts`（`POST /api/transcribe`（multipart の `file` と `language`）→ `{ text }`、`GET /api/voice`、`POST /api/voice/models/:id/download`、`DELETE /api/voice/models/:id`、`PUT /api/voice/openai-key`）。OpenAI のキーは `secrets` の `openai_transcribe_key` に置く。
- 文字起こしの処理・コマンドの探し方・ダウンロードの fetch は、テストで差し替える（`VoiceService` の `engines` / `findTools` / `fetch`）。

## メモ（memos/）

- プロジェクトの「メモ」タブのメモは、プロジェクトの外のフォルダの Markdown（DB に入れない。Finder・ほかのアプリでも開け、Kickoff を作り直しても残る）。画面の説明は `src/renderer/src/features/memo/CLAUDE.md`。
- フォルダは `MemoService.dirOf(project)`: プロジェクトの `memo_path`（このプロジェクトだけ別の場所）があればそこ、なければ設定の `memos_dir`（null なら既定の `~/Documents/<保存先のフォルダ名> メモ`。`startCore` が決める。開発版は「Kickoff Dev メモ」）の下の `memo_folder`。`memo_folder` は初めて使ったときにプロジェクト名から決めて覚える（`@shared/memo/names` の `safeMemoName`。ほかのプロジェクトのフォルダ名とは `uniqueMemoName` で重ねない）。
- パスはメモのフォルダからの相対で受け、`git/files.ts` の `assertInside` で外を断る。「.」で始まる名前（隠しファイル）は扱わない。中身の読み書きはエディタのファイルと同じ `readProjectFile` / `writeProjectFile`（保存は開いたときの指紋と比べて 409）。一覧は隠しファイル・リンクを除いて 5000 件まで。ゴミ箱へは `/usr/bin/trash`（テストでは差し替える）。
- 変えたら SSE の `memos`（`project_id` と変えたメモ。ゴミ箱は null）を出す。Kickoff の外での変更は知らせない（画面がウィンドウに戻ったときなどに取り直す）。
- チャットの文から作る（`fromChat`）: 新しいメモは `chatMemoName` の「<チャット名> チャットメモ<n>.md」（見出し・出どころの行 `memoSourceLine`・本文）、追記は区切り線を挟んで最後に足す。要約はプロジェクトのプロバイダーの `summarize`（対応していなければ 400）。
- メモのチャット: メモごとに 1 つのふつうのチャット（`chats.memo_path`。`POST /api/projects/:id/memo/chat` で最初の指示を送って作る（メモがなければ 404、もうあれば 409）。続きはふつうのチャットと同じ API）。作業場所はプロジェクトのまま（コードも読める）で、実行のときにメモのフォルダを読み書きできる場所に足し、どのメモの横で話しているかをシステムプロンプトに書く（`Runner` の `memoDirOf` → `turn.ts` の `buildTurnParams`・`policy.ts` の `buildSystemPrompt` の `memo`）。AI はメモのファイルを直接書き換え、ツールの結果が届くたびに SSE の `memos` を出す（開いているメモが、書きかけでなければ読み直す）。メモの名前を変える・動かすと `store.chats.remapMemoPath` で付け替え、ゴミ箱に入れたら、そのメモのチャット（作業中でないもの）をアーカイブする。
- AI のフォルダの整理案（`memoAi.ts`。動かさず、案を返すだけ）: `aiPlan`（メモのパスと書き出しを見せて、名前の変更・移動の案を JSON で受け、使える案だけを残す `parseMemoPlan`: 一覧にないメモ・使えない行き先・拡張子が変わる・行き先が重なる・もうある名前は除く）。プロジェクトのプロバイダーの `ask`（sonnet）で聞く。
- API は `http/routes/memos.ts`（`GET /api/memos/defaults`・`GET /api/projects/:id/memos`・`GET|PUT|DELETE /api/projects/:id/memo`・`POST /api/projects/:id/memos`（作る）・`/memos/move`・`/memos/from-chat`・メモのチャットを始める `POST /api/projects/:id/memo/chat`・AI の整理案 `POST /api/projects/:id/memos/ai-plan`）。

## テスト

- `npm test`（`node --import tsx --test`。`node:test` と `node:assert/strict`）。DB はメモリ（`new Store(":memory:")`）で、外のネットワーク・Claude Code は呼ばない。
- API のルートを変えたら、その領域の `http/server.<領域>.test.ts` にテストを足す: 認証・本文の読み取り・`:id` の引き当て・SSE・停止・画面の配信 = `server.test.ts` / 設定・プロジェクト（固定・アーカイブ・タグ・色も）= `server.projects.test.ts` / チャット（一覧・作成・変更・移動・削除・記録）・グループ・添付・回答待ち・プロバイダー・使用枠・既定の推論の深さ・/ のコマンド・自動のアーカイブ = `server.chats.test.ts` / 作業中のチャット（未読・作業中の様子・裏の作業・圧縮・再試行・停止・止めずに伝える・報告の受け渡し）= `server.turns.test.ts` / 送信待ち = `server.queue.test.ts` / 止まったあとの再開 = `server.recovery.test.ts` / 分岐・巻き戻し・ファイルを戻す = `server.rewind.test.ts` / Git・ワークツリー = `server.git.test.ts` / サービスごとの使用状況 = `server.usage.test.ts` / 音声入力 = `server.voice.test.ts` / メモ = `server.memos.test.ts`（ゴミ箱は `memoFake` で、本物のゴミ箱に入れない）。
- 準備は `testing/` の補助を使い、テストごとに書き直さない: API は `testServer.ts` の `setup()`（偽のプロバイダーで組み立てたアプリと、トークン付きで呼ぶ `call(method, url, body)`・`store`・`runner`・`project`・`provider` など。ほかのサービス・音声入力・つながったかの確かめも偽物）。`Runner` を直に試すなら `testCore.ts` の `setupCore(provider)` と、台本どおりに振る舞う `fakeProvider.ts` の `ScriptedProvider` / `gatedScript`。条件を待つのは `until(cond)`（2 秒で失敗）。再開の確かめ方・時計・書き直しの持ち時間は `Runner` に渡す値（`reconnect` / `usageLimit` / `editHoldTtlMs`）で差し替える。
- 一時フォルダは `testing/tempDir.ts` の `tempDir()`（テストのあとに消える。`real` でリンクを解決したパス）、Git の作業場所は `testing/gitRepo.ts` の `gitRepo({ files })`（main ブランチと最初のコミット。Git の名前を設定していない環境でもコミットできる）。チャット・記録・プロジェクト・グループのデータは `@shared/testing/factories`（`makeChat` / `makeEvent` など）。
