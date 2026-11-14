# Kickoff の設計（2026-11 の作り直し）

> 2026-11-04 に、リリース前の作り直しとして決めた設計。スキーマ・ディレクトリ構成・名前の決まり・共通化の対象と、その手順を書く。
> 書き方の決まりはリポジトリの `CLAUDE.md`、機能ごとの説明は各フォルダの `CLAUDE.md` にある。

## 0. 決めたこと

| 項目 | 決定 |
|---|---|
| 保存データ | 引き継がない。新しい版を初めて起動したとき、リリース前の版の DB（`kickoff.db` と `-wal` / `-shm`）・`backups/`・`uploads/` を消して、空の DB から始める。写しは取らない |
| 古い仕組み | v17 からの変換（`legacyMigration` / `legacyValues`）と、版を上げる前の写し（`dbBackup`）はなくす。localStorage の以前の値の読み替えもなくす |
| 見た目・動き | 共通化に伴う小さな統一はしてよい（場所ごとに少しずつ違う見た目・動きを、共通の部品に寄せて 1 つにする）。変えたものは最後に一覧で報告する |
| 機能 | 使っていない機能・設定も消さない（候補は報告にだけ書く） |
| CLAUDE.md | ルートは書き方の決まり・置き場所・確かめ方だけ。機能の説明はそのフォルダの `CLAUDE.md`（そこを触るときだけ読まれる）へ |
| 進め方 | main で、区切りごとにコミット（プッシュしない）。各段で typecheck・test・knip・build を通す |

## 1. 語彙

画面の言葉とコードの名前を 1 対 1 にする。以前は、保存される会話（チャット）と 1 回の実行の両方を `run` と呼んでいた。

| 画面の言葉 | コード | 以前 |
|---|---|---|
| チャット | `Chat` / 表 `chats` / `chat_id` | `Run` / `runs` / `run_id` |
| 1 回の実行（送ってから終わるまで） | `Turn`（`executeTurn` / `TurnOutcome` / `TurnControl`） | `executeRun` / `RunOutcome` / `RunControl` |
| チャットの記録 | `ChatEvent` / 表 `chat_events` | `RunEvent` / `run_events` |
| グループ | `ChatGroup` / 表 `chat_groups` | `RunGroup` / `run_groups` |
| 定型文（チャット欄の中の上の帯から入れる・送る、よく使う指示。共通かプロジェクトだけ） | `Snippet` / 表 `snippets`（`project_id` が NULL = 共通）・`features/snippet/` | なし |
| 音声入力（マイク。話した言葉を文字にして入力欄に入れる）・音声モード（波形。話し終わったら送るか入力欄に入れ、AI の返答を声で読み上げる会話） | `useDictation` / `useVoiceMode`・`VoiceSession`・読み上げ `Speaker`（`features/dictation/`）・コアの `VoiceService` | なし |
| 圧縮前指示（会話を圧縮する前に AI に送る指示。メモを残してもらうなど。設定の共通の指示 → プロジェクトの指示の順につなぐ。それぞれオン / オフを切り替えられ、オフなら文を残したまま送らない） | 設定・プロジェクトの `pre_compact_prompt` / `pre_compact_enabled`・`@shared/chat/prompts` の `compactPromptFor`・記録の `user.pre_compact`・`core/chat/preCompact.ts`・PreCompact フック `core/providers/claude/preCompact.ts` | なし |
| 圧縮後指示（会話を圧縮したあと、圧縮の間に預かった指示より先に AI に送る指示。メモを読み直してもらうなど。つなぎ方は圧縮前指示と同じ） | 設定・プロジェクトの `post_compact_prompt` / `post_compact_enabled`・`@shared/chat/prompts` の `postCompactMessage`・記録の `user.post_compact`・送信待ちの `QueuedMessage.post_compact`・`core/chat/preCompact.ts` の `postCompactItem` | なし |
| プロジェクトフォルダ（プロジェクトに登録したフォルダ。AI が作業する所。git のリポジトリの中のフォルダでもよい。「フォルダ」「プロジェクトのフォルダ」「本体のフォルダ」とは呼ばない。ワークツリーと並べるときだけ「本体」） | `Project.repo_path`（`PUT /api/projects/:id/repo-path`・`changeProjectFolder`。AI へはシステムプロンプトの「プロジェクトフォルダ」） | 「フォルダ」「プロジェクトのフォルダ」「本体のフォルダ」・システムプロンプトの「リポジトリ」 |
| 作業フォルダ（そのチャットの AI が実際に作業する所。本体で作業するならプロジェクトフォルダ、ワークツリーならその中の同じ位置） | `workdirOf(chat, project)`（`chat.worktree_path ?? project.repo_path`） | システムプロンプトの「リポジトリ」 |
| メモフォルダ（「メモ」タブのメモを置くフォルダ。プロジェクトフォルダとは別の場所で、プロジェクトフォルダを変えても変わらない） | `MemoService.dirOf(project)`（`memo_path` か、設定の `memos_dir` の下の `memo_folder`） | 「メモの保存先」「メモのフォルダ」 |
| 送信待ち | `Queue`（`chat_queues`） | `followups` / `run_queues` |
| 添付（チャットの指示に添えるもの。種類 = ファイル（📎・ドラッグ・貼り付け）/ メモ（付けたときの写し）/ 取ったもの（「AI に渡す」で押したときの中身をファイルにしたもの）。中身は送らず、パスと見出しを書き添えて AI が Read で読む） | `Attachment`（`kind`: `file` / `memo` / `capture`）・取ったものの出どころ `AttachmentSource`（`type` は `ATTACHMENT_SOURCE_TYPES`）・`POST /api/captures`・`POST /api/projects/:id/memo/snapshot`・`UploadStore`（`core/chat/uploads.ts`）・見出し `core/chat/attachmentNotes.ts`・鍵を伏せる `@shared/secrets/redact` | kind のない添付（memo があればメモ。読むときに `normalizeAttachment` で読み替える） |
| AI に渡す（各タブの 1 つのもの（issue・PR・CI の落ちたステップのログ・DB のつながらない様子・ブラウザのタブの画面とコンソール・ターミナルで選んだ長い文など）を、押した時点の中身の札にしてチャットの入力欄に一言と入れる。渡し先 = 新しいチャットで始める / このチャットに追加 / 新しい子チャットで聞く / ほかのチャットに追加。送るのは自分で） | 渡すもの `HandOffItem`・渡し先 `HAND_OFF_TARGETS`（`features/chat/handoff/handOff.ts`）・ボタン `HandOffButton`（「AI に渡す ▾」）・ブラウザの中身はメインプロセスの `agentBrowser.handOffCapture`（`@shared/ipc` の `BrowserHandOffCapture`）・画像の札は `POST /api/captures` の `image_base64` | なし |
| 起動したときの送信待ちの確かめ（前回の終了で、自動で送るまま残った送信待ちを、起動してから送るか聞く。送る / 続けてから送る / 止めておく） | `QueueResume` / `QueueResumeAction`（確かめを待つ印は `ChatLive.queue_resume`。`GET\|POST /api/queue-resumes`・`Runner.queueResumes`・画面の `QueueResumeDialog` / `QueueResumeBanner`・店 `stores/queueResumes.ts`） | なし |
| 送信待ちに挟む行（会話の圧縮・コンテキストの消去） | `QueueAction`（`compact` / `clear`。`QueuedMessage.compact` / `clear`・`@shared/chat/queueActions`） | 圧縮の予約だけ |
| コンテキストの消去（これまでの会話を AI に引き継がず、次から新しい会話で始める。記録は残す） | `Runner.clearContext`・記録 `context_cleared`（巻き戻し・子チャットの引き継ぎはこの境目を越えない `core/chat/sessionPoints.ts`） | なし |
| 作業中の様子（保存しない） | `ChatLive` | 詳細と SSE で別々の形 |
| フィード（全プロジェクトの画面の、チャットごとのメインエージェントの最新の返答 1 件を新しい順に並べたもの） | `FeedItem`（`GET /api/feed`・`store.events.feed`・画面の `FeedList` / `useFeed`） | なし |
| チャットの選択（モデル・深さ・権限・ファスト） | `ChatOptions`（`model` / `effort` / `permission_mode` / `fast_mode`） | `RunOptions`・`ProjectDefaults`（`permission` / `fastMode`）・設定（`claudeModel` / `defaultPermission`）・`ProviderRunParams`（`permissionMode`）の 4 通り |
| 権限モード | `PermissionMode` | `PermissionChoice` |
| AI のブラウザ操作（チャットの AI が Kickoff の埋め込みブラウザのタブを見る・操作する。操作中のタブには「AI 操作中」の印） | 口 `BrowserControl`（`core/browser/`）・ツール `kickoff_browser`（`browserMcpServer`）・実装 `agentBrowser`（`main/browser/`）・IPC `agentBrowser`・印 `useAgentBrowsing` | なし |
| AI が作る子チャット（チャットの AI が自分の子チャットを作って依頼を送る。毎回聞く / 聞かずに作る / 作らせない） | ツール `kickoff_chat`（`create_child_chat`。`chatMcpServer`・名前は `@shared/chat/aiChildChat` の `AI_CHILD_CHAT_TOOL`）・中身 `AiChildChatTools`（`core/chat/aiChildChat.ts`）・設定 `ai_child_chat`（`AiChildChatMode`: `ask` / `allow` / `off`） | なし |
| 家系（いちばん上の親チャットから下にぶら下がるチャットの全部。チャットの AI が名前・固定・グループを聞かずに変えられる範囲） | ツール `kickoff_chat` の `list_family_chats` / `update_chat`（名前は `@shared/chat/aiChatEdit` の `AI_LIST_FAMILY_TOOL` / `AI_UPDATE_CHAT_TOOL`・引数 `UpdateChatInput`）・中身 `AiChatEditTools`（`core/chat/aiChatEdit.ts`）・関係の呼び名 `familyRelation`（`core/chat/chatFamily.ts`） | なし |
| AI が開く（チャットの AI がメモ・家系のチャット・ファイル・差分を利用者の画面に開き、SQL を SQL のタブに入れる。右の欄 / 別ウィンドウ / 設定どおり） | ツール `kickoff_chat` の `open_memo` / `open_chat` / `open_file` / `open_diff` / `open_sql`（`chatOpenTools.ts`。名前は `@shared/chat/aiOpen` の `AI_OPEN_MEMO_TOOL` など）・中身 `AiOpenTools`（`core/chat/aiOpen.ts`）・SSE の `open_view`（`OpenViewRequest`・場所 `OpenPlace`: `side` / `window`）・画面の受け口 `useAiOpenRequests`（`renderer/src/app/aiOpenRequests.ts`） | なし |
| AI の下書き（チャットの AI が家系のチャットの入力欄の後ろに文を足す。送るのは利用者） | ツール `kickoff_chat` の `add_draft`（`AI_ADD_DRAFT_TOOL`）・SSE の `chat_draft`（`ChatDraftRequest`。親チャットに入れるなら札 `from`）・画面の受け口は同じ `useAiOpenRequests` | なし |
| AI が読む（チャットの AI が同じプロジェクトのチャットの一覧・会話と使用枠・このプロジェクトのターミナルの出力を読む） | ツール `kickoff_chat` の `list_project_chats` / `read_chat` / `get_usage`（`chatReadTools.ts`・`@shared/chat/aiRead`・中身 `AiChatReadTools`（`core/chat/aiChatRead.ts`）・やり取りへの分け方 `conversationTurns`（`core/chat/conversation.ts`））と `list_terminals` / `read_terminal`（`chatTerminalTools.ts`・`@shared/chat/aiTerminal`・中身 `AiTerminalTools`（`core/chat/aiTerminal.ts`）・読み取りの口 `TerminalControl`（`core/terminal/control.ts`。中身はコアの `TerminalSessions`）） | なし |
| AI が足す・変える（チャットの AI がこのプロジェクトの定型文に足す・メモの名前を変える／移す） | ツール `kickoff_chat` の `add_snippet` / `move_memo`（`chatProjectTools.ts`・`@shared/chat/aiProject`）・中身 `AiProjectTools`（`core/chat/aiProject.ts`） | なし |
| 未読 / 既読 | `unread` / `read` | `attention`・列の `review` / `done` |
| タブの入れ物（右のパネル・チャット欄・下のパネル・右の欄） | `Panel`（`usePanel`） | `SidePanel`（3 か所で使うのに「横」） |
| 右の欄（チャットの画面の右に、サブエージェントの画面を並べる欄。チャットのタブの中に入れ子にしたタブの入れ物） | 欄 `agents`（`SURFACES.agents`・`AgentSplit`）・タブの種類 `subagent`・画面 `SubagentScreen` | パネルのタブで開くサブエージェント（`SubagentPane`。メインエージェントとのつながりが見えないのでやめた） |
| チャットタブ（チャットをボードと分けて横幅いっぱいに開くプロジェクトのタブ。設定でボードの右のパネルにも戻せる） | タブ `chats`（`#/projects/:id/chats`）・`ChatsTab`・置き方の設定 `CHAT_PLACEMENT`（`separate` / `together`）。中身はボードの右のパネルと同じ `kanban:<プロジェクト>` のパネル | ボードの右のパネルだけ |
| メモ（プロジェクトの「メモ」タブ。プロジェクトの外のフォルダの Markdown か HTML（HTML のメモ = HTML と CSS で書くページ。描いた見た目で見る）） | メモのフォルダ（設定 `memos_dir` の下の、プロジェクトの `memo_folder`。別の場所なら `memo_path`）・`MemoService`（`core/memos/`）・`MemoTab`（`features/memo/`） | なし |
| メモのチャット（メモの右の欄で話す、メモごとに 1 つのふつうのチャット。一覧には並べず、そのメモの右の欄から開く。AI はメモのファイルを直接読み書きする） | `Chat` の `memo_path`・`POST /api/projects/:id/memo/chat`・`MemoChat`（`features/memo/`） | なし |
| 子チャット（チャットの発言から「新しい子チャットで聞く」・右の欄の「＋」の「新しい子チャット」で始める横道の質問。親の中にだけ置き、いちばん上の親の右の欄か別ウィンドウで開く（設定 `CHILD_CHAT_OPEN_IN`。作ったときは `CHILD_CHAT_OPEN_ON_CREATE` で、開かないも選べる）。孫・ひ孫も作れる。サブエージェントの「伝える」で「新しい子チャットで聞く」を選ぶと、そのサブエージェントの会話の記録を添えた子チャットになる） | `Chat` の `parent_chat_id`（親）・`parent_event_id`（聞いた発言）・`startChildChat`（`core/chat/children.ts`）・`startSubagentChildChat`（`core/chat/subagentChild.ts`）・`features/chat/children/` | なし |
| 親への依頼文（子チャットの AI に、親チャットの AI へ渡す依頼文だけを書いてもらう頼み。発言の印 = 依頼文の頼み）・親チャットに追加（子チャットの作業の最後の返答を、そのまま直接の親に渡す。渡し方 = 入力欄 / 今すぐ送る / 送信待ち、渡したあと = そのまま / アーカイブ / 削除）・渡したことの印 / 出どころの札 | 頼み方の文 `handoffRequestPrompt`・最後の返答 `lastReplyOfTurn`（`@shared/chat/handoff`）・発言の印 `MessageMarks`（`handoff_request` / `handoff_from`）・渡し方 `HandoffVia`・渡したあと `HandoffAfter`・`POST /api/chats/:id/handoff`（`core/chat/handoff.ts`）・記録 `handoff`・`features/chat/children/handoff.ts` | なし（「最新の答えを引用して渡す」は前からの `handBackText`） |
| 会話 / 動き（チャットの画面の見え方。動き = メインエージェントとすべてのサブエージェントの動きを 1 本の時系列に） | `ChatShowing`（`conversation` / `activity`）・`ActivityRow`（`features/chat/activity/`） | なし（サブエージェントは別のタブ） |
| GitHub タブ（プロジェクトの画面の上のタブで、連携先のリポジトリの issue・PR を「issue｜PR」で切り替えて見る・書く・AI に渡す。チャットの右の欄にも開ける。要件定義書の「5.11 GitHub」。段階 1「読む」・段階 2「AI に渡す」・段階 3「書く」まで作った。PR のチェックの「ログを開く」は CI のタブへ） | タブ `github`（`#/projects/:id/github`）・右の欄のタブの種類 `github`・画面 `features/github/`・コア `core/github/`（gh api の GraphQL・REST。ワークツリーの PR の見張り・push の `core/git/github.ts` はそのまま）・HTTP `/api/projects/:id/github/…` | なし（push と PR の作成だけ） |
| 連携先（PR・issue を見る GitHub のリポジトリ。プロジェクトフォルダの git の remote から自動で決める。`gh repo set-default` → `upstream` → `origin`）と、プロジェクトで使う GitHub のアカウント（gh に入っているものから選ぶ。gh の有効なアカウントは切り替えない） | `GitHubRemote`・`GitHubTarget`（`core/git/githubTarget.ts`）・選んだ remote はプロジェクトの `github_remote`・アカウントは `github_account`（`GitHubAccount`・`core/git/githubAccount.ts` の `runAsGitHubAccount`）・ワークツリーの PR を見張るかは `pr_watch`・設定の画面は `ProjectGitHub` | なし |
| ワークツリーの PR の知らせ（ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられたこと。印と 1 つの確認で片付けを聞く） | `WorktreePrNotice`・見張り `WorktreePrWatch`（`core/git/prWatch.ts`）・閉じた確認の表 `pr_notice_dismissals`・画面 `features/worktree/prNotice/` | 「マージの通知」（macOS の通知と紛らわしい） |
| CI のタブ（プロジェクトの画面の上のタブ「CI」（「GitHub」の隣）。GitHub Actions の実行の一覧・ジョブとステップのログ・AI に渡す・やり直す。外の CI は成否とリンクだけ。この Mac のアプリの中だけ。要件定義書の「5.15 CI の結果」） | タブ `ci`（`#/projects/:id/ci`）・画面 `features/ci/`・コア `core/github/ci.ts` の `CiService`（読み方は純粋な `ciNormalize.ts`）・HTTP `/api/projects/:id/ci/runs/…`（端末には開かない）・共有の型 `@shared/types/ci.ts`（実行 `CiRun`・ジョブ `CiJob`・ステップ `CiStep`・状態 `CiState` / `CI_STATES`・外の CI `CiExternalCheck`） | なし |
| CI の失敗の知らせ（作業場所のブランチと既定のブランチで落ちた実行を Mac の通知で。同じ実行は 1 回だけ） | プロジェクトの `ci_watch`（v21）・知らせた実行 `ci_failure_notices`（v21。店 `store.ciNotices`）・PR の見張りの `alsoCheck` で `CiService.watch`・SSE `ci_failed`（`CiFailure`）・出すかの判断はコアの `core/notifications/center.ts`・通知の ID `kickoff-ci:`（`notifications.onOpenCi`） | なし |
| issue・PR の結び付き（どの issue・PR のためのチャットか。カード・見出しに `#番号`。GitHub タブの「AI に渡す」で付く） | `Chat` の `github_repo` / `github_number` / `github_kind`（v19。種類は PR を作るときに「Closes #番号」を足すのを issue だけにするため） | なし |
| DB クライアント（プロジェクトの画面の上のタブ「DB」・チャットの右の欄の ▾ の「DB ▸」・別ウィンドウで開く。接続の一覧・テーブル・SQL・ER 図。要件定義書の「5.12 DB クライアント」） | タブ `db`（`#/projects/:id/db`）・画面 `features/database/`・コア `core/databases/`・HTTP `/api/projects/:id/db-connections/…`（接続元が 127.0.0.1 の頼みだけ受ける） | なし |
| DB 接続（プロジェクトごとに登録する接続。ほかのプロジェクトから写せる） | `DbConnection` / 表 `db_connections`（v13）。パスワードは `secrets` の `db_connection:<id>:password`、AI 用のユーザーのパスワードは `:ai_password`（v14。段階 2 で `:ssh_password`）。値はメインプロセスが渡す `safeStorage` で暗号化したもの（暗号化した印を付ける。`safeStorage` のない単体のコア・テストだけ暗号化せずに置く。暗号化を入れた版の最初の起動で、暗号化せずに置いていた値を一度だけ置き換える）。キーチェーンで拒否されて開けないときに利用者が入れたパスワードは、コアのメモリにだけ持つ。接続を消すと、表のトリガー `db_connections_drop_secrets` がその接続の秘密の値も消す（プロジェクトを消したときの連鎖の削除でも効く） | なし |
| DB の種類 | `DbEngine`（`sqlite` / `postgres` / `mysql`。MariaDB は `mysql`） | なし |
| 環境（DB 接続の環境。色・読み取り専用・書き込みの前の確かめ・AI の既定をまとめて決める） | `DbEnvironment`（`local` / `dev` / `staging` / `production`） | なし |
| 書き込む前の確かめ（DB 接続ごと。危険な文だけ / 書き込みのたび / 環境の名前を打つ） | `DbWriteCheck`（`dangerous` / `all` / `env_name`。既定は環境から: ローカル・開発 = `dangerous`、ステージング = `all`、本番 = `env_name`）・接続の `write_check`（v20）。危険な文の判定は `@shared/database/sqlStatements.ts` の `dangerReason` / `writeConfirmation` | なし |
| AI に見せるか（DB 接続ごと。見せない / 承認して見せる / 自由に見せる） | `DbAiAccess`（`none` / `ask` / `allow`。既定は環境から: ローカル・開発 = `allow`、ステージング = `ask`、本番 = `none`）・AI のツール `kickoff_db`（`db_connections` / `db_objects` / `db_describe` / `db_query`。中身は `core/databases/aiTools.ts` の `DbAiTools`、MCP は `providers/claude/dbTools.ts`。すべて `allowedTools` に入れ、ツールの中で `ai_access` を見て、見せない接続は名前でも断り、承認して見せる接続の `db_query` は承認カードで聞く（権限モードによらず効く））・AI 用のユーザー `ai_username`（v14。あれば AI の SQL だけこのユーザーでつなぐ）・見せない接続の守り（AI がそのホスト・URL・SQLite のファイルを使う Bash と、ファイルのツールで SQLite のファイルを開くのを PreToolUse で断る。`chat/guard/hiddenDb.ts`） | なし |
| ER 図（DB クライアントのタブ。接続と場所（DB・スキーマ）ごとに 1 つ） | タブ `DbErTab`（`lib/dbClientTabs.ts`。まわりを見る中心 `focus`・段の数 `depth`・描くテーブル `names`）・中身 `DbErSchema` / `DbErTable`（`POST …/db-connections/:cid/er`）・関係 `ErRelation`（外部キーと、制約のない関係の推測 `inferred`。多さ `ErCardinality`）・動かした位置 `DbErPositions` / 表 `db_er_layouts`（v15）・店 `store.dbErLayouts` | なし |
| テーブルの絞り込み（テーブルのタブのデータの上の帯。条件か WHERE の式）・行の詳細・書き出し | 絞り込み `DbRowFilter`（条件 `DbFilter`・比べ方 `DbFilterOp` / `DB_FILTER_OPS`・WHERE の式 `where`。タブの `DbTableTab.filter`。SQL は `@shared/database/dbFilter.ts` の `filterSql`）・行の詳細 `TableRowDetail`・書き出しの形 `DbExportFormat`（CSV / TSV / JSON） | なし |
| プロジェクトからの取り込み（DB クライアントの接続の一覧の「プロジェクトから取り込む」） | 見つけた案 `DbImportCandidate`（見つけた所 `DbImportSource` / `DB_IMPORT_SOURCES`: env・compose・prisma・file）・取り込む本文 `DbImportBody`・コア `core/databases/import/`（`scanProjectDbs`）・`GET|POST …/db-connections/import` | なし |
| 接続の手順メモ（つなぎ方（経路）ごとに 1 つのメモ。いくつもの接続で同じメモを使える）・つながらないときの案内 | 接続の `memo_path`（v16。メモのフォルダからの相対パス。`MemoService.move` が `store.dbConnections.remapMemoPath` で付け替える）・置き場所 `DB_MEMO_DIR`（`DB/`）・タブ `DbMemoTab`（`lib/dbClientTabs.ts`）・失敗の種類 `DbFailureKind`（`@shared/database/dbFailure.ts` の `dbFailureKind`・よくある原因 `DB_FAILURE_CAUSES`・「AI に渡す」の一言 `dbFixText` と札の中身 `dbFailureDocument`）・案内 `DbFailureDialog` | なし |
| つなぐ前の準備（つなぐ前に流すコマンド・切るときの後片付け・ポートを転送するコマンド・パスワードを取るコマンド。初めて・中身を変えたあとは確かめてから流す）と次に確かめる日 | 接続の `prep`（`DbPrep`。v18）・確かめたか `prep_confirmed`（確かめていなければ 409 と `DB_PREP_UNCONFIRMED`）・`check_on` / `check_note`・記録 `DbPrepRun`（表 `db_prep_runs`）・いまの様子 `DbPrepState`（ワーカーのメモリだけ）・`{名前}` の埋め方 `@shared/database/dbPrep.ts`・ワーカーの `worker/prep.ts` と `worker/shell.ts`・画面の `ConnectionPrepFields` / `DbPrepDialog` | なし |
| テーブルの行の変更（段階 3 のセルの編集・行の追加と削除・CSV の取り込み。保存するまで画面に持つ） | 変更 `DbRowEdit`（`update` / `insert` / `delete`。行はキー `DbKeyValue` で指し、値は `DbEditValue`）・本文 `DbEditsBody` / 結果 `DbEditsResult`（`POST …/db-connections/:cid/edits`。1 回に `DB_EDITS_MAX` 件まで）・SQL の組み立て `@shared/database/dbEdit.ts`（`editStatements`・行を指す列 `editKeyColumns`）・ワーカーの `apply`・画面の保存していない変更 `TableEdits`（`features/database/tableEdits.ts`）・`useTableEdits` | なし |
| SSH トンネル（踏み台を通して DB につなぐ。初めての踏み台は鍵の指紋を確かめる） | 接続の `ssh`（`DbSsh`: `host` / `port` / `user` / `identity_file`。v17）・パスワード `db_connection:<ID>:ssh_password`（`has_ssh_password`）・ワーカーの `worker/tunnel.ts`（`createTunnels`。同じ踏み台と DB へのトンネルは使い回す）・初めての踏み台の印 `DB_SSH_UNKNOWN_HOST`（409）・鍵 `DbSshHostKey`（`sshHostKey.ts`）・画面の `SshHostKeyDialog` | なし |
| SQL の履歴（接続ごと。AI が流したものに印） | `DbQueryHistoryEntry` / 表 `db_query_history`（v14。`ran_by` = `user` / `ai`、AI なら `chat_id`。接続ごとに新しい `DB_HISTORY_MAX`（500）件だけ残す）・店 `store.dbQueryHistory` | なし |
| DB ワーカー（DB の接続・SQL の実行・結果の整形・SSH トンネル・準備のコマンドを動かす別のプロセス。初めて DB を使ったときに立ち上げ、何もしない状態が 5 分続いたら止める（準備のコマンドを流している間は止めない）） | `core/databases/worker/`（Electron ではメインプロセスが `utilityProcess` で `out/main/dbWorker.js` を起動する口をコアに渡す（製品版は Electron の fuses で RunAsNode をオフにするので `ELECTRON_RUN_AS_NODE` は使わない）、`npm run daemon`・テストでは `worker/main.ts` を tsx で fork。コアの側は登録の表とワーカーとのやり取り `DbWorkerClient` だけ） | なし |
| Docker タブ（プロジェクトの画面の上のタブ「Docker」（「DB」の隣）。本体とワークツリーの compose のサービスを見て、起動・停止し、ログをタブの中のログの画面で見て、シェルを下のパネルのターミナルで開く。この Mac のアプリの中だけ。要件定義書の「5.14 Docker」。段階 1 と段階 2「DB で開く」を作った） | タブ `docker`（`#/projects/:id/docker`）・画面 `features/docker/`（状態と操作の hook `useDocker`・描く部品 `DockerPane`・ログの画面 `DockerLogs`）・コア `core/docker/`・API `GET /api/projects/:id/docker`（一覧）・`POST …/docker/actions`（操作）・`POST …/docker/watch`（見ています）・`GET …/docker/logs`（ログの流れ・さかのぼり）・`GET …/docker/db`（「DB で開く」の行き先）・SSE `docker_changed`（`project_id`）・共有の型 `@shared/types/docker.ts` | なし |
| ワークツリーの実行環境（ワークツリーごとにポートの番号と Docker の組の名前を分け、本体と複数のワークツリーのアプリを同時に動かす。要件定義書の「5.16」）と帯（ワークツリーに渡す 100 個ずつの番号のまとまり。20100〜29900 の 99 本。+00 は開発サーバー、+01 から Docker の公開ポート）・対応表（本体の番号 → 帯の番号）・整えきれていない所（手順で分けきれなかった所）・分けられない理由 | `WorktreeEnv`・`WorktreePortSlot`（`@shared/types/worktreeEnv.ts`）・表 `worktree_envs`（v22）・コア `core/worktreeEnv/`（`WorktreeEnvService`）・`GitWorktree.env`・`issues`・`blocked`・ワークツリーの `.env` の Kickoff の区切りと `.kickoff/compose.worktree.yaml`・［AI で整える］のチャット（Git で管理していないファイルだけを書ける）= `Chat.untracked_only`（v23） | 「ポートの範囲」「ポートのずらし」 |
| ポートを使っているプロセス（Kickoff のプロジェクトのフォルダで TCP のポートを待っているもの。要件定義書の「5.17」）・起動元（Kickoff の中 / 切り離されている / ほかのアプリ）・帯の添え書き | `PortProcess`・`PortOrigin`（`PORT_ORIGINS`）・`PortBandNote`（`@shared/types/ports.ts`）・コア `core/ports/`（`PortProcessService`・`PortWatch`）・SSE の `ports_changed` | 「開発サーバーの一覧」「サービス」 |
| compose（Docker タブの見出し。compose のファイルごとに 1 つ。プロジェクトフォルダからの場所と作業場所の札を出す）・サービス（compose に書いた 1 つ 1 つ。行）・コンテナ（サービスから作ったもの。「作っていない」サービスもある） | 見つけ方とファイルの選び方 `core/docker/compose.ts`（中身は `docker compose -f … --profile '*' config --format json` に聞く。YAML は読まない） | なし |
| 組の名前（compose のプロジェクト名。`-p` / `name:` / `COMPOSE_PROJECT_NAME`。Kickoff のプロジェクトと混ざるので、画面でも文書でも「プロジェクト」と呼ばない） | ラベル `com.docker.compose.project`（作ってあるもの）・`config --format json` の `name`（作っていないもの） | なし |
| 札付きのサービス（compose の `profiles:` の札が付いた、必要なときだけ使うサービス。薄く並べ、「すべて起動」に含めない）・使い捨てのコンテナ（`docker compose run` で作ったもの。サービスの行の下に畳む） | `profiles`・ラベル `com.docker.compose.oneoff=True` | なし |
| 同じ組（2 つの作業場所、または同じ作業場所の 2 つの compose が同じ組の名前になること。コンテナとボリュームを共有し、片方の up でもう片方が作り直される） | 見出しの ⚠・起動の前の［起動する］［やめる］ | なし |
| ログの画面（Docker タブの中、一覧の下に出す compose のログ。サービスの札で絞り込み、時刻の順に並べる。区切りの行 = 見ている間にコンテナが止まった・起動し直したことを示す行。エラー・警告の印は行の文字の決まりで付ける目安） | 画面 `features/docker/DockerLogs`・コア `core/docker/logs.ts`（コンテナごとの `docker logs --timestamps`）・エラーと警告の見分け `@shared/docker/logLevel.ts` | なし |
| ポートの取り合い（Docker 同士。up が失敗してから相手を出す）・静かなぶつかり（Docker の外のプロセスが同じ番号で待っている。起動は成功し、127.0.0.1 への接続は外のプロセスが受ける） | `core/docker/portConflict.ts`（`lsof -nP +c 0`・エンジンの名前の一覧・`brew services info --all --json`） | なし |
| AI の Docker の守り（別の作業場所のコンテナを止める・消す・作り直す、ボリュームを消す、まとめて止める・消す AI の Bash を、Auto mode でも承認カードで聞く） | `core/chat/guard/dockerGuard.ts`（待てる PreToolUse。承認は `requestApproval`・`canRemember: false`） | なし |
| 本体（スマホから見た、Kickoff のコアが動いている PC。いまは Mac）・本体の ID（本体を見分ける ID。スマホが複数の本体を切り替える目印。DB を作ったときに決め、DB を写して開発版を作ったら作り直す）・端末（この Mac の Kickoff を外から使うスマホなど。1 台ずつつなぎ、1 台ずつ取り消す）・端末ができること（使える / 見るだけ。見るだけの端末はチャットを読めるが、送る・答える・止めるはできない） | `DeviceAccess`（`full` / `read`。`DEVICE_ACCESS_LABELS`。表 `devices` の `access`（v25）。断る印 `DEVICE_READ_ONLY`）・`Store.databaseId`（`meta` の `database_id`。`/api/status` の `database_id`）・`Device`（`@shared/types/device.ts`）・表 `devices`（v24。トークンは hash だけ・プッシュの宛先 `push` は外に出さない）・店 `store.devices`・`core/system/devData.ts` の `becomeAnotherHost` | なし |
| スマホ連携のオン・オフ（スマホからつなぐか。オンのときだけ端末の登録を受け付け、端末からの頼みを受け、電源につないでいる間は本体を眠らせない。待ち受けは 127.0.0.1 のまま） | 設定の `remote_enabled`（前は「LAN に公開」の意味だったが効いていなかった。2026-11-14 に決め直した）・断る印 `MOBILE_OFF` | 「リモート接続」 |
| 呼び主（API を呼んだのが、この Mac の画面か、つないだ端末か。どのトークンで来たかだけで決める）・端末に開く口（端末から使える API。既定は閉じていて、書いたものだけ開く） | `Caller`（`core/http/caller.ts`。`host` / `device`）・`DEVICE_ROUTES` / `deviceMayUse` / `deviceMaySee`（`core/http/deviceAccess.ts`）・403 の印 `DEVICE_FORBIDDEN` | `localOnly`（接続の相手のアドレスで見分けていた） |
| ペアリング（端末をつなぐこと。Mac の画面が使い捨ての番号と QR を出し、端末が番号で頼み、Mac の画面で「この端末をつなぎますか」と確かめてから端末のトークンを 1 回だけ渡す）・つなぐ先の URL（端末から Mac の Kickoff に届く URL。QR に入れる） | `PairingCenter`（`core/devices/pairing.ts`）・`PairingState` / `PairingRequest` / `PairingClaimBody` / `PairingPollResult`（`@shared/types/device.ts`）・`pairingLink`（`@shared/devices/pairing.ts`）・設定の `mobile_url`・画面の `features/settings/MobileSettings.tsx` | `/pair?token=`（本体のトークンを QR に入れていた） |
| 通知の判断（チャットの完了・失敗・回答待ち・CI の失敗を、それを見ていない人（この Mac の画面・端末）にだけ知らせる）・見ているもの（前に出しているチャット・CI のタブ。呼び主ごと） | `core/notifications/`（`NotificationCenter` / `Notice` / `PushSender` / `ViewingRegistry`）・`PUT /api/viewing`（`ViewingBody`）・`startCore({ notify, push })` | 画面の `useChatNotifications` / `useCiFailureNotifications`（画面が判断していた） |
| API の版（Mac の Kickoff とスマホのアプリのやり取りの形の番号。Kickoff の版とは別に持ち、形を壊す変更をしたときだけ 1 つ上げる。1.0 からは変更を「足すだけ」（項目を消さない・名前を変えない）にし、壊すなら版を上げる。0.x の間は壊してよい）・話が通じない（アプリが古すぎる / Mac の Kickoff が古すぎる） | `@shared/api/version.ts`（`API_VERSION` / `MIN_CLIENT_API_VERSION` / 見出し `x-kickoff-api` / `client_too_old`・`host_too_old` / `apiMismatch`）・SSE の最初の行 `ServerHello`・`ServerStatus.api_version` | なし |

### チャットの軸とエージェントの軸

「親・子」と「メイン・サブ」は別の軸なので、画面の言葉で混ぜない（以前は単独の「メイン」が、メインエージェント・親チャット・右の欄を持つチャットの 3 つを指していた）。

| 軸 | 画面の言葉 | コード |
|---|---|---|
| チャット（利用者が作る会話。木） | 親チャット / 子チャット / 孫チャット / ひ孫チャット（関係で呼ぶ。`@shared/chat/childDepth` の `childDepthLabel`）。右の欄・別ウィンドウで文を足す先のチャット（右の欄を持つチャット・別ウィンドウを開いたチャット）は「メイン」と呼ばず、名前で出す（「「機能開発」に追加」。`features/chat/chatTitle` の `chatTargetName`） | `Chat.parent_chat_id`・足す先 `MainChatContext`（コードの名前は残す） |
| エージェント（1 つのチャットの中で動く AI。木） | メインエージェント / サブエージェント。サブエージェントから見た上は「起動したエージェント」（入れ子なら外のサブエージェント）で、「親」と呼ばない | `SubagentEntry.parentKey`・`subagentTree` |
| ウィンドウ | メインウィンドウ / 別ウィンドウ | `features/popout/` |

単独の「メイン」は画面に出さない（メインエージェント・メインウィンドウとだけ使う）。向きで動詞を分ける:

| 動詞 | 向き | 例 |
|---|---|---|
| 伝える | 下へ。動いている作業に届き、作業を変える | 「メインエージェント経由で伝える」（サブエージェントへ直接は送れず、メインエージェントが SendMessage で渡す）・作業中のチャットに伝える |
| 聞く | 横へ。だれの作業にも影響しない子チャットで聞く | 「新しい子チャットで聞く」・サブエージェント「…」について聞く |
| 渡す | 上へ。答え・報告を返す | 「親チャットに渡す」・サブエージェントの「報告をいま渡す」 |

## 2. 名前の決まり

- HTTP API・SSE・DB に出る形は snake_case（設定 `AppSettings` も）。コードの変数・関数、画面の中だけの型、Electron の IPC の形は camelCase。
- 外のツールの形をそのまま写すもの（Claude Code の AskUserQuestion の `multiSelect` など）は、そのままにする。
- 「ない」は `null`（空文字で「本体」「不明」を表さない。`worktree_path` が `null` なら本体）。
- 状態の値は 1 か所の定数（`as const` の配列）から型を作り、画面の文言は同じ場所の `…_LABELS` に置く。
- HTTP API・SSE・DB に出る相対パス（ファイル・メモ・検索の結果・Git の一覧・compose のファイル・取り込みの SQLite のファイルなど）の区切りは、OS によらずいつも「/」。コアは外に出す前に `core/system/paths.ts` の `toApiPath` / `relativeApiPath` を通す（Git の出力はもともと「/」）。受けたパスは `path.join` がどちらの区切りも読むので、そのまま使う。画面・スマホは区切りを OS で読み分けない。絶対パス（`repo_path`・`worktree_path` など）は OS の形のまま。

## 3. スキーマ（新しい v1）

`src/core/db/schema.ts`。すべて STRICT。真偽値は `CHECK (x IN (0, 1))`、JSON は `CHECK (json_valid(x) AND json_type(x) = 'object' | 'array')`。値の一覧（状態など）は CHECK にしない（増やすたびに表を作り直すことになるため）。版は `PRAGMA application_id`（'KICK'）と `user_version`（200 ＋ 版）。リリース前の系統（101〜104）は 0. のとおり消して作り直し、それ以外の見知らぬ版は触らずに例外にする。

```sql
-- アプリの設定（キーごとの JSON。既定とマージして AppSettings にする）
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK (json_valid(value))) STRICT;
-- 秘密の値（API キーなど）。設定とは別の表にし、画面・SSE には出さない（以前は settings に secret: を付けて同居）
CREATE TABLE secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK (value <> '')) STRICT;
-- DB そのものの情報。database_id = 作ったときに決める ID（画面が覚えている「ID 入りの表示の状態」を、DB を作り直したら捨てる目印）
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL UNIQUE,              -- 同じフォルダは 2 回登録しない（以前は取り込みのときだけ確かめていた）
  provider TEXT NOT NULL,                      -- 新しいチャットのプロバイダー
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(chat_defaults) AND json_type(chat_defaults) = 'object'),  -- Partial<ChatOptions>
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths) AND json_type(reference_paths) = 'array'),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW),
  -- v2: メモのフォルダ（memo_folder = 設定の親フォルダの下のフォルダ名。初めてメモを使ったときに決めて覚える /
  -- memo_path = このプロジェクトだけ別の場所にするときの絶対パス）。ALTER TABLE で末尾に足す
  memo_folder TEXT CHECK (memo_folder <> ''),
  memo_path TEXT CHECK (memo_path <> ''),
  -- v6: 圧縮前指示（このプロジェクトだけの分。設定の共通の指示のあとにつなぐ）
  pre_compact_prompt TEXT CHECK (pre_compact_prompt <> ''),
  -- v8: 圧縮後指示（このプロジェクトだけの分。設定の共通の指示のあとにつなぐ）
  post_compact_prompt TEXT CHECK (post_compact_prompt <> ''),
  -- v9: 圧縮前指示・圧縮後指示を送るか（0 = オフ。文は残す）
  pre_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pre_compact_enabled IN (0, 1)),
  post_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (post_compact_enabled IN (0, 1)),
  -- v12: このプロジェクトの GitHub（NULL = 自動。アカウントは gh でいま有効なもの、連携先は remote から決める）
  github_account TEXT CHECK (github_account <> ''),  -- 使う gh のアカウント（gh auth token --user のトークンを GH_TOKEN で渡す）
  github_remote TEXT CHECK (github_remote <> ''),    -- 選んだ連携先の remote の名前（もうない remote なら自動）
  pr_watch INTEGER NOT NULL DEFAULT 1 CHECK (pr_watch IN (0, 1))  -- ワークツリーの PR を見張るか
) STRICT;
-- 以前の active_at（画面は使っていなかった。最近動いた順はチャットの active_at で決める）と、一覧の集計（費用・動いている数。未使用）はなくす

CREATE TABLE chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),   -- 以前は NULL を許し、開くたびに埋めていた
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW)
) STRICT;

CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES chat_groups(id) ON DELETE SET NULL,   -- 同じプロジェクトのグループだけ（トリガーで守る）
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT, effort TEXT, permission_mode TEXT NOT NULL,
  fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1)),
  worktree_path TEXT CHECK (worktree_path <> ''),   -- NULL = 本体
  branch TEXT CHECK (branch <> ''),                 -- 最後に送ったときのブランチ。NULL = 分からない
  status TEXT NOT NULL,                             -- running / completed / failed / cancelled（queued・waiting はなくす）
  error TEXT,
  session_id TEXT,
  turn_started_at TEXT,
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  num_turns INTEGER NOT NULL DEFAULT 0 CHECK (num_turns >= 0),
  context_tokens INTEGER, context_window INTEGER,
  unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW),
  active_at TEXT NOT NULL DEFAULT (NOW),            -- 最後に動いた時刻（送った・終わった）。名前・固定・アーカイブ・グループ・移動では進めない
  -- v3: 子チャット（parent_chat_id = 親。親を消すと子孫も消える / parent_event_id = 聞いた親の発言の記録の ID。NULL = 位置なし）。ALTER TABLE で末尾に足す
  parent_chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
  parent_event_id INTEGER CHECK (parent_event_id > 0),
  -- v4: メモのチャット（memo_path = どのメモについてのチャットか。メモのフォルダからの相対パス。NULL = ふつうのチャット）
  memo_path TEXT CHECK (memo_path <> ''),
  -- v7: 親と一緒にアーカイブした子チャットの印（親を戻すとき、この印のある子孫だけを戻す。店の中だけで使い、Chat には出さない）
  archived_with_parent INTEGER NOT NULL DEFAULT 0 CHECK (archived_with_parent IN (0, 1)),
  -- v10: 手動の並び（サイドバーの並び順「手動」。プロジェクトの中の 1 本の並びで小さいほど上。NULL = まだ並べていない新しいチャットで、手動ではまとまりのいちばん上）
  position INTEGER
) STRICT;
-- v3: CREATE INDEX idx_chats_parent ON chats(parent_chat_id) WHERE parent_chat_id IS NOT NULL;
-- v4: CREATE INDEX idx_chats_memo ON chats(project_id, memo_path) WHERE memo_path IS NOT NULL;
-- 以前の result（書くだけで読まれない。同じ文が記録の result にある）はなくす

CREATE TABLE chat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  created_at TEXT NOT NULL DEFAULT (NOW),
  -- 全文検索の対象（自分の発言とメインの AI の返答。サブエージェントの文は除く = チャットの中の検索と同じ）
  text TEXT GENERATED ALWAYS AS (CASE WHEN type = 'user' OR (type = 'text' AND json_extract(data, '$.parent') IS NULL) THEN json_extract(data, '$.text') END) VIRTUAL
) STRICT;
-- 全文検索の索引 chat_event_search（FTS5 trigram。ビュー chat_event_texts を中身にして、トリガーで追従）は以前と同じ仕組み

CREATE TABLE chat_queues (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(messages) AND json_type(messages) = 'array'),  -- QueuedMessage[]
  stops TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stops) AND json_type(stops) = 'array'),           -- 一時停止の位置（以前の stop_after。古い形の読み替えはなくす）
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
) STRICT;
-- v5: 定型文（project_id = NULL なら共通、番号ならそのプロジェクトだけ。label = NULL なら本文の 1 行目を名前に見せる。
-- position = 全体で 1 本の並び）
CREATE TABLE snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT CHECK (label <> ''),
  text TEXT NOT NULL CHECK (text <> ''),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW),
  updated_at TEXT NOT NULL DEFAULT (NOW)
) STRICT;
-- v5: CREATE INDEX idx_snippets_position ON snippets(position);
-- v11: ワークツリーの PR の知らせで、確認を閉じた PR（同じ PR では確認を出し直さない。ワークツリーを消して知らせがなくなったら消す）
CREATE TABLE pr_notice_dismissals (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  dismissed_at TEXT NOT NULL DEFAULT (NOW),
  PRIMARY KEY (project_id, pr_number)
) STRICT;
-- v13: DB クライアントの接続（プロジェクトごと。パスワードは secrets の db_connection:<id>:password に置き、ここには持たない）
CREATE TABLE db_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  engine TEXT NOT NULL,                       -- DbEngine
  environment TEXT NOT NULL,                  -- DbEnvironment
  host TEXT CHECK (host <> ''),
  port INTEGER CHECK (port > 0),
  database TEXT CHECK (database <> ''),
  username TEXT CHECK (username <> ''),
  file_path TEXT CHECK (file_path <> ''),     -- SQLite: プロジェクトフォルダからの相対（外のファイルは絶対パス）。ワークツリーではその中の同じパス
  ssl TEXT CHECK (json_valid(ssl) AND json_type(ssl) = 'object'),   -- NULL = SSL なし（{ mode: require | verify, ca_path? }）
  read_only INTEGER NOT NULL CHECK (read_only IN (0, 1)),
  ai_access TEXT NOT NULL,                    -- DbAiAccess
  position INTEGER NOT NULL,                  -- プロジェクトの中の並び
  last_connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW),
  updated_at TEXT NOT NULL DEFAULT (NOW)
) STRICT;
-- v13: CREATE INDEX idx_db_connections_project ON db_connections(project_id, position);
-- v13: 接続を消したら、その接続の秘密の値（パスワード）も消す（プロジェクトを消したときの連鎖の削除でも効く）
-- CREATE TRIGGER db_connections_drop_secrets AFTER DELETE ON db_connections BEGIN
--   DELETE FROM secrets WHERE key LIKE 'db_connection:' || OLD.id || ':%';
-- END;

-- v14: AI 用のユーザー（NULL = username と同じ。パスワードは secrets の db_connection:<id>:ai_password）
ALTER TABLE db_connections ADD COLUMN ai_username TEXT CHECK (ai_username <> '');
-- v14: SQL の履歴（接続ごとに新しい 500 件だけ残す。AI が流したものは ran_by = ai と chat_id）
CREATE TABLE db_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  sql TEXT NOT NULL CHECK (sql <> ''),
  ran_by TEXT NOT NULL,                       -- user / ai（仕様書の by。SQL の予約語なので名前を変えた）
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  row_count INTEGER,
  error TEXT,
  ran_at TEXT NOT NULL DEFAULT (NOW)
) STRICT;
-- v14: CREATE INDEX idx_db_query_history_connection ON db_query_history(connection_id, id);

-- v15: ER 図で動かした位置（接続と場所ごと。「自動で並べ直す」で消す）
CREATE TABLE db_er_layouts (
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  place TEXT NOT NULL CHECK (place <> ''),   -- 場所のキー（@shared/database/erDiagram の erPlace: DB.スキーマ。SQLite は main）
  positions TEXT NOT NULL CHECK (json_valid(positions) AND json_type(positions) = 'object'),  -- テーブル名 → { x, y }
  updated_at TEXT NOT NULL DEFAULT (NOW),
  PRIMARY KEY (connection_id, place)
) STRICT;

-- v16: 接続の手順メモ（メモのフォルダからの相対パス。いくつもの接続で同じでよい。メモの名前の変更・移動で付け替える）
ALTER TABLE db_connections ADD COLUMN memo_path TEXT CHECK (memo_path <> '');

-- v17: SSH トンネル（{ host, port, user, identity_file }。NULL = なし。パスワードは secrets の db_connection:<ID>:ssh_password）
ALTER TABLE db_connections ADD COLUMN ssh TEXT CHECK (json_valid(ssh) AND json_type(ssh) = 'object');

-- v18: つなぐ前の準備のコマンド（DbPrep: { prepare: [], cleanup: [], tunnel, password, my_ip_url }。NULL = なし）・
-- 利用者が確かめた中身の写し（@shared/database/dbPrep の prepConfirmKey。いまの prep と同じ間だけ確かめ済み）・次に確かめる日とひとこと
ALTER TABLE db_connections ADD COLUMN prep TEXT CHECK (json_valid(prep) AND json_type(prep) = 'object');
ALTER TABLE db_connections ADD COLUMN prep_confirmed TEXT CHECK (prep_confirmed <> '');
ALTER TABLE db_connections ADD COLUMN check_on TEXT CHECK (check_on <> '');   -- YYYY-MM-DD
ALTER TABLE db_connections ADD COLUMN check_note TEXT CHECK (check_note <> '');
-- v18: 準備のコマンドの記録（いつ・どの種類のどのコマンド・成功 / 失敗だけ。出力は残さない。接続ごとに新しい 200 件）
CREATE TABLE db_prep_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                        -- prepare / cleanup / tunnel / password（DB_PREP_KINDS）
  command TEXT NOT NULL CHECK (command <> ''),  -- 登録したまま（{my_ip} などを埋める前）
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  ran_at TEXT NOT NULL DEFAULT (NOW)
) STRICT;
-- v18: CREATE INDEX idx_db_prep_runs_connection ON db_prep_runs(connection_id, id);

-- v20: 書き込む前の確かめ（DbWriteCheck: dangerous = 危険な文だけ / all = 書き込みのたび / env_name = 環境の名前を打つ。既定は環境から。
--      v20 より前の接続は ステージング = all・本番 = env_name・ほか = dangerous に入れた）
ALTER TABLE db_connections ADD COLUMN write_check TEXT NOT NULL DEFAULT 'dangerous';
```

### GitHub 連携

要件定義書の「5.11 GitHub」。GitHub の issue・PR の中身は DB に持たない（正しいのはいつも GitHub。コアのメモリに少しの間だけ覚え、開いたときは必ず GitHub に聞く）。段階 1「読む」はスキーマを変えずに作り、段階 2「AI に渡す」のチャットとの結び付きを v19 で足した。メモリに覚えるのは、一覧（ETag で変わったかを聞く）と、最後に取った中身（開き直したときのつなぎの表示。`?cached=1`）。非公開のリポジトリの中のファイルを指す本文の画像は、コアが `gh api` で取って返す（`GET …/github/image`。鍵はコアにも画面にも持たない。2026-11-13）。

```sql
-- projects の連携先（github_remote）・アカウント（github_account）は v12 で入れた
-- v19: chats に足す（どれも NULL = 結び付いていない）
github_repo TEXT CHECK (github_repo <> ''),        -- 結び付いた issue・PR のリポジトリ（owner/name）
github_number INTEGER CHECK (github_number > 0),   -- issue・PR の番号
github_kind TEXT CHECK (github_kind <> ''),        -- issue / pr（PR を作るとき「Closes #番号」を足すのは issue だけ）
-- 3 つがそろって NULL か、そろって値があるかは店で守る（ALTER TABLE では表の CHECK を足せないため）
```

### CI の結果（作った）

要件定義書の「5.15 CI の結果」。詳しい仕様はメモの「CI の結果 仕様書」。実行・ジョブ・ログは DB に持たない（開くたびに GitHub に聞く。ログは `gh run view <実行> --job <ジョブ> --log` / `--log-failed`、ほかは REST）。覚えるのは、知らせたかどうかとプロジェクトごとの切り替えだけ（v21）。

```sql
-- v21
-- projects に足す
ci_watch INTEGER NOT NULL DEFAULT 1 CHECK (ci_watch IN (0, 1)),  -- CI の失敗を知らせるか
-- 知らせた実行（同じ実行は 1 回だけ。プロジェクトごとに新しい 500 件を残す）
CREATE TABLE ci_failure_notices (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL CHECK (run_id > 0),
  notified_at TEXT NOT NULL,
  PRIMARY KEY (project_id, run_id)
) STRICT;
```

- 見張りは PR の見張り（`core/git/prWatch.ts`）に相乗りする（`alsoCheck`。5 分ごとと窓に戻ったとき。ワークツリーのないプロジェクトも見る）。見張るブランチは作業場所（本体・各ワークツリー）で取り出しているブランチと既定のブランチで、ワークフローごとのいちばん新しい実行が落ちていて、まだ知らせておらず、終わってから 24 時間以内なら知らせる（`ciNormalize.ts` の `failuresToNotify`）。
- 「（ブランチ名）で直す」の作業場所は `POST …/ci/runs/:run/worktree`（既定のブランチなら本体 = `worktree_path: null`。ほかは PR の「レビューコメントで直す」と同じ `checkoutPullWorktree` でワークツリーを使い回すか作る）。

### ワークツリーの実行環境

要件定義書の「5.16」。ワークツリーを作るときだけ決め、起動のたびには調べない（docker の手前に入口を挟む・起動のたびに調べる形は、macOS のログインシェルが PATH を並べ直して素通りされたので使わない）。書くのは Git で管理していないファイルだけ（写した `.env` と `.kickoff/compose.worktree.yaml`。`.kickoff/` は `.git/info/exclude`）。詳しい仕様はメモの「ワークツリーの実行環境 仕様書」。

```sql
-- v22: 作業するフォルダ（GitWorktree.path）ごとに 1 行。帯は全プロジェクトで 1 つのワークツリーにだけ渡す
CREATE TABLE worktree_envs (
  path TEXT PRIMARY KEY CHECK (path <> ''),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  band INTEGER UNIQUE CHECK (band IS NULL OR band > 0),          -- 帯の先頭（分けていなければ NULL）
  host TEXT CHECK (host <> ''),                                   -- 埋め込みブラウザの名前（<ブランチ名>.localhost）
  slots TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(slots) AND json_type(slots) = 'array'),                      -- 対応表
  compose_names TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(compose_names) AND json_type(compose_names) = 'array'),  -- 割り当てた組の名前
  rewritten TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rewritten) AND json_type(rewritten) = 'array'),          -- 書き換えた変数
  issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues) AND json_type(issues) = 'array'),                   -- 整えきれていない所
  blocked TEXT CHECK (blocked <> ''),                             -- 分けられない理由
  created_at TEXT NOT NULL
) STRICT;
```

- 帯は「本体の番号 ＋ 10000 × n」（4 本までしか置けない）・「本体の番号 ＋ 100 × n」（開発サーバーの本体の番号が分からないことがあり、開発の道具の 3000〜9000 番台とぶつかりやすい）を比べて、2 万番台の 100 個ずつの帯にした。帯を選ぶときは、ほかのワークツリーに渡した帯と、いま待ち受けている番号がある帯を飛ばす。
- DB と `.env` の両方に覚える（DB は空いている帯を選ぶ・画面に出す・消すときに帯を空ける・組の名前を割り当てたかを見分ける）。
- AI とターミナルには `PORT=帯+00` を渡すだけで、開発サーバーの起動は持たない。
- 段階 2（v23）: 手順で整えきれない所を AI に直してもらう［AI で整える］（利用者が押したときだけ。`POST /api/projects/:id/git/worktrees/env-setup`）は、そのワークツリーの新しいチャットで、Git で管理していないファイルだけを書ける（`chats.untracked_only`。守りは `core/chat/guard/scope.ts` の `evaluateUntrackedWrite`）。Docker タブの「DB で開く」でワークツリーの DB から作った DB クライアントの接続は、そのワークツリーを覚え（`db_connections.worktree_path`）、ワークツリーを消すときに一緒に消せる。

```sql
-- v23
ALTER TABLE chats ADD COLUMN untracked_only INTEGER NOT NULL DEFAULT 0 CHECK (untracked_only IN (0, 1));  -- Git で管理していないファイルだけを書けるチャット
ALTER TABLE db_connections ADD COLUMN worktree_path TEXT CHECK (worktree_path <> '');                       -- どのワークツリーの DB から作った接続か
```

### スマホ連携の端末（v24）

スマホからつなぐ構成はメモの「スマホ連携 サーバー構成の比較と案（図）」。端末のトークンは hash（SHA-256）だけを置き、本物は端末にだけある。プッシュの宛先（Expo のトークン・Web Push の購読）も表にだけ置き、API には「登録したか」だけを出す。本体の ID は今の `database_id` を使い（URL・OS のマシン ID・ID だけのファイルは使わない）、DB を写して開発版を作ったら写した先で作り直して端末の表を空にする（写した先は別の本体。製品版につないだ端末のトークンで開発版に入れないように）。

```sql
-- v24
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),                     -- 端末が名乗った名前
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash <> ''),  -- 端末のトークンの hash
  push TEXT CHECK (push IS NULL OR (json_valid(push) AND json_type(push) = 'object')),  -- プッシュの宛先（DevicePush）
  created_at TEXT NOT NULL DEFAULT (…),
  last_used_at TEXT                                          -- 最後に API を使った時刻（60 秒より細かくは書かない）
) STRICT;
```

### ポートを使っているプロセス

要件定義書の「5.17」。DB には何も持たない（スキーマは変えない）。詳しい仕様はメモの「ポートを使っているプロセス 仕様書」。

- 調べ方（`core/ports/service.ts` の `PortProcessService.list`）: `lsof -nP +c 0 -iTCP -sTCP:LISTEN`（OS の口 `HostPlatform` の `listeningSockets`。macOS は `core/platform/macos/listening.ts`。Docker タブの静かなぶつかり・ワークツリーの帯の選び方と同じ読み方）→ `ps -A -o pid=,ppid=,etime=,command=`（親・動いている時間・コマンド）→ `lsof -a -d cwd -p … -Fpn`（作業フォルダ）→ アーカイブしていないプロジェクトの本体とワークツリー（`listWorktrees`。実体のパス）のうち、いちばん深く入る作業場所に振り分ける。Kickoff 自身（メイン・自分の .app の束の中の子孫 = Helper）とその祖先（製品版の中で開発版が動いているときの製品版）は出さない。帯の添え書きは `worktree_envs`（全プロジェクト）から引く。純粋な関数は `core/ports/parse.ts`。
- 調べるとき（`core/ports/watch.ts` の `PortWatch`）: `GET /api/ports`（窓を開いた・↻）・止めたあと・チャットの実行が終わったとき（Bus の `chat` の状態が running から変わったら 2 秒待って 1 回。続けて終わればまとめる）。調べたら SSE の `ports_changed`（数 `count`。実行が終わったあとは、前に調べたときになかった pid の数 `fresh`）。一覧はコマンドの全文を含むので SSE に載せず（スマホの画面にも届くため）、画面は知らせを受けたとき・起動したときに `GET /api/ports?cached=1`（コアが最後に調べた一覧。まだなら調べる）を読む。
- 止める（`POST /api/ports/stop`。本文 `PortStopBody`）: 調べ直して、いまの一覧にあり `command_full` が同じものだけ（なければ 404、変わっていれば 409）。SIGTERM（`force` なら SIGKILL）を送り、5 秒まで終わるのを待って `stopped` を返す。口は端末には開かない（`core/http/deviceAccess.ts`）。
- 画面: 下の帯の `features/footer/ports/`（`PortsButton`・`PortsPopover`・店 `portsStore`）。Mac のアプリの中だけ（`portsAvailable`。スマホの画面では帯のボタンも ⌘K の項目も出さない）。⌘K の項目は移らずに `run` で窓を開く（`PaletteItem.run`）。

### DB クライアントの段階 2・段階 3

段階 1（登録・接続・表の中身・SQL・本番の守り）は v13 の `db_connections`、段階 2 の AI の読み取り（AI 用のユーザー）と SQL の履歴は v14、ER 図の位置は v15、手順メモは v16、SSH トンネルは v17、準備のコマンドは v18 で作った（段階 2 はこれで終わり）。接続ごとの書き込む前の確かめは v20。段階 3（セルの編集・行の追加と削除・CSV の取り込み）はスキーマを変えずに作った（変更は画面のメモリにだけ持ち、保存は SQL の履歴に残す。詳しい仕様はメモの「DB クライアント 仕様書」。決めることはすべて決定・2026-11-11）。DB の中身・スキーマは持たない（いつも接続先に聞く）。

- 準備のコマンドは列を分けず、1 つの JSON の列 `prep` にした（パスワードの出どころは「`password` のコマンドがあればそれ、なければ保存したパスワード」で決まるので、`password_source` は持たない）。確かめた覚えは中身の写し `prep_confirmed`（中身・問い合わせ先を変えれば写しと合わなくなり、確かめ直す）。
- 置き場所: コアは `core/databases/`（`service.ts`・ワーカー `worker/`（種類ごとのドライバ `sqlite.ts` / `postgres.ts` / `mysql.ts`）。段階 2 の SSH トンネル `worker/tunnel.ts`・ssh の引数と出力の読み方 `sshArgs.ts`・サーバーの鍵 `sshHostKey.ts`・取り込みの `import/`）、文の分割と判定（`@shared/database/sqlStatements.ts`）・URL の読み取り（`dbUrl.ts`）・段階 2 の制約のない関係の推測は純粋な関数として `src/shared` に置いてテストする。API のテストは `server.databases.test.ts`。PostgreSQL・MySQL・MariaDB を使うテストは `worker/drivers.dbtest.ts` を Docker で立てて別のコマンド `npm run test:db` で流す（`npm test` は外につながないまま）。
- 段階 1 で決めたこと: ワーカーとのやり取りは `{ id, method, params }` → `{ id, ok, result | error }`、止めるのは `{ cancel: id }`（`core/databases/protocol.ts`）。ワーカーが落ちたら待っている頼みを失敗にし、次の頼みで立ち上げ直す。

### Docker タブ（段階 1・段階 2。作った）

要件定義書の「5.14 Docker」。詳しい仕様はメモの「Docker 仕様書」（段階 1・段階 2 は決定・2026-11-13。段階 2 は「DB で開く」）。**表は足さない**（覚えるものがない。ログも保存しない（ログの画面を開いている間だけ Docker から読み、画面に持つのは 1 万行まで、閉じたら捨てる）。正しいのはいつも Docker で、一覧は開くたび・知らせのたびに `docker ps` から作る）。コアのメモリにだけ持つのは、compose ごとの「動いている操作」と「最後の失敗」（コアを起動し直したら消える）、compose の中身（`config --format json` の結果。compose のファイルと `.env` の更新日時を鍵に覚える）、「見ています」の期限。

- 置き場所: 共有の型 `src/shared/types/docker.ts`（コンテナの状態の値（`as const`）と `…_LABELS`、一覧・操作の形。snake_case）。コア `src/core/docker/`（`service.ts` 一覧・操作・エンジンの状態、`listing.ts` 一覧の組み立て（純粋）、`actions.ts` 操作のコマンドの並び（純粋）、`events.ts` 見ている間だけ動かす `docker events`、`compose.ts` compose のファイルと override・`COMPOSE_FILE` を見つける・組の名前、`portConflict.ts` / `ports.ts` ポートの取り合いと静かなぶつかり、`logs.ts` ログの画面の流れとさかのぼり、`guardFacts.ts` AI の守りが見る様子、`dbTarget.ts` 「DB で開く」の案（純粋））。ルート `core/http/routes/docker.ts`（端末には開かない。`core/http/deviceAccess.ts`）。AI の守り `src/core/chat/guard/dockerGuard.ts`（`selfProtection.ts` の隣）。画面 `features/docker/`（ログの画面も中に作る。`CLAUDE.md` を足し、ルートと画面全体の表に 1 行足す）。プロジェクトのタブは `router.ts` の `PROJECT_TABS` に `docker`、スマホで隠すのは「DB」「GitHub」タブと同じ形（`ProjectPage.tsx`・`ProjectTabs.tsx` の `window.kickoff` での出し分け）。
- 依存の向き: `core/docker` はコマンドを `core/system` の補助で流すだけで、チャットを知らない。`core/chat/guard/dockerGuard.ts` は相手の作業場所を決めるために `core/docker` の読み取り（`docker ps` の読み方・作業場所への振り分け・組の名前）を使う（`chat → docker` の向き。`docker` から `chat` は import しない）。判定は文だけで決める純粋な関数と、止める・消すコマンドのときだけ `docker ps` を引く部分に分ける。
- コマンドの流し方: すぐ終わるもの（`ps`・`start` / `stop` / `restart` / `unpause`・`config`・`lsof`・`brew services` など）は今の `runCommand`（`core/system/exec.ts`）。流れ続ける `docker events`・［中止］できる `docker compose up -d`・ログの画面で流れ続ける `docker logs -f` だけは、`spawn` で動かす小さな補助を `core/system` に足して使う（止める口と、出力を 1 行ずつ渡す口を持つ）。どちらで動かすかはコマンドごとに作るときに決める。`core.close()` で流れているものをすべて止める。`docker` はログインシェルから取り込んだ PATH（OS の口の `loadLoginShellPath`）と `~/.orbstack/bin` で探し、環境変数は `DOCKER_CLI_HINTS=false`。
- 見ている間だけ: Docker タブを表示している画面は `POST /api/projects/:id/docker/watch` を 20 秒ごとに送り（開いた瞬間にすぐ 1 回。応答に今の一覧）、コアはどのプロジェクトからも 45 秒届かなければ `docker events` を止める。変化は 300ms まとめて一覧を取り直し、SSE の `docker_changed` を出す（操作の始まり・終わり・失敗・［中止］・失敗の［×］のときも）。
- ログの画面: `GET /api/projects/:id/docker/logs` は、選んだサービスのコンテナごとに `docker logs -f --timestamps --tail 500` を流し、その画面だけの SSE の応答（`DockerLogEvent`: 行・止まった・動き直した・失敗）にまとめて返す（アプリ全体の SSE `GET /api/events` は全部の画面に配るので、ログの行は流さない）。見ている間にコンテナが止まった・起動し直した・作り直された（別の ID）ことはコアが `docker events` で知り、区切りの行を入れて新しいコンテナのログを続けて流す。さかのぼりは `GET …/docker/logs/before` に `until`（いちばん古い行の時刻）を付けて `--until` と `--tail 500` で読む（流さない）。画面に持つのは 1 万行まで。応答を閉じたら（画面を閉じた・札を変えた）コアは `docker logs` を止める。⌘F はログの画面にピントがあればその中、それ以外は `registerPageFind`。エラー・警告の見分けは文字の決まりの純粋な関数（画面の `features/docker/dockerLogView.ts` の `logLevelOf`）。AI に渡すのは、選んだ範囲 / エラーの行と前後 20 行に文脈の頭（作業場所・compose・サービス（コンテナ）・時刻の範囲）を付けた引用で、足す先の選び方は共通の「チャットに追加」（`features/chat/handoff`）。
- ターミナル（シェルのため）: IPC の `terminal.open(key, cwd, cols, rows)` に、省いてよい `{ command, title, env }` を足す（取り決めは `src/shared/ipc`。画面の `panelActions.openTerminal`・タブの型 `panelTypes.ts` も）。`command` はログインシェルの `-l -c` で流し、終わったら開き直さず「終了しました」と［もう一度流す］を出す（`TerminalPane.tsx`）。ターミナルの ⌘F の検索は Docker の依頼から外した（2026-11-13）。
- AI の守りのフック: 今の `turnHooks(params, self)`（`core/providers/claude/policy.ts`）の `denyHook` は判定をすぐ返す作りなので、待てる PreToolUse を足し、`ProviderCallbacks` を渡す口を足す（フックの中で `requestApproval` を呼ぶ。DB のツールの承認 `dbTools.ts` と同じ口）。`docker ps` は 3 秒で打ち切り、答えがなければ通す。承認は時間で打ち切らない。入れ子の作業場所を見分けるため、フックにはチャットの作業場所に加えて、プロジェクトの本体とワークツリーの一覧を渡す。
- 段階 2「DB で開く」（スキーマは変えない）: postgres・mysql・mariadb のサービスから DB タブを開く。行き先は `GET /api/projects/:id/docker/db?compose=&service=`（`DockerDbTarget`: 登録済みの同じ DB の `connection_id` / 取り込みの案 `candidate` / 押せない理由 `blocked`）。案は DB クライアントの取り込みと同じ読み方（`core/databases/import/fromCompose.ts` の `candidatesFromCompose`）で、YAML でなく compose に聞いた設定（一覧で覚えた `config --format json` の中身）から作る（`core/docker/dbTarget.ts`。`core/docker → core/databases/import` の向きで、取り込みは Docker を知らない）。同じ DB かは種類・この Mac の中のホスト・ポートで比べ（`@shared/database/dbServer.ts` の `sameLocalServer`。画面の取り込みの選び方も同じ）、ワークツリーの db が本体と同じポートなら本体の接続、別のポートなら別の DB として名前にブランチを添える。登録は今の `POST …/db-connections/import` に案の key（`docker:<サービス>:<見出しのキー>`）を渡し、コアが compose に聞き直して作る（パスワードは画面に出さない）。画面は DB クライアントへの頼み（`dbClientRequests.ts`）に `import` を足し、取り込みの画面をその案だけ選んだ形で開く。ワークツリーの DB から作った接続はそのワークツリーを覚え（v23 の `db_connections.worktree_path`）、ワークツリーを消す確認の「この接続も消す」で一緒に消せる（ワークツリーの実行環境の段階 2）。
- 別の機能に分けたもの: 本体とワークツリーで組の名前・ポートを確実に分ける仕組みは「ワークツリーの実行環境」（メモの仕様書は下書き）。Docker タブは組の名前を変えない。

### 記録（chat_events の data）

`ChatEvent` は `type` で中身が決まる判別共用体にする（以前は `data` が `type` と結びついておらず、`event.data as …` が 50 か所あった）。新しい DB なので「以前の記録にはない」ための任意の項目は必須にする。

| type | data | 以前からの変更 |
|---|---|---|
| `user` | `text` `attachments` `message_uuid` `handover?` `pre_compact?`（圧縮前指示。text は指示の文だけで、AI には前置きを付けて渡す）`post_compact?`（圧縮後指示。同じく前置き `postCompactMessage` を付けて渡す）`handoff_request?`（子チャットに親への依頼文を頼んだ発言）`handoff_from?`（子チャットから渡した依頼の出どころ `{ chat_id, title }`） | `message_uuid` を必須に |
| `init` | `session_id` `model?` `permission_mode?` `effort?` | |
| `text` / `thinking` / `tool_use` / `tool_result` | 以前どおり＋`parent?`（サブエージェントのもの） | `sub` をなくす（`parent` があればサブエージェント） |
| `approval` | `approval_id` `kind` `tool_name` `title?` | |
| `approval_resolved` | `approval_id` `kind` と、`action` が `answer` なら `answers` `attachments?` | `kind` を必須に、回答は `action` で判別 |
| `result` | `status`（completed / failed / cancelled）`text?` `session_id?` `message_id?` `network?` `usage_limit?` | 読まれない `cost_usd` `turns` をなくす。使用枠の上限で止まったら `usage_limit`（以前は画面が文を正規表現で読み直していた） |
| `error` / `notice` | `message` | |
| `compact` | `trigger` `pre_tokens` `post_tokens?` | |
| `subagent` | `SubagentInfo` | |
| `handoff` | `via`（composer / send / queue）`parent_chat_id` `turn_event_id`（子チャットの作業の返答を親に渡した。渡すたびに 1 件。流れには出さず、渡した作業の終わりの行の印にする） | 新しく足した |

### 設定（AppSettings）

snake_case にし、チャットの選択の既定を `ChatOptions` 1 つにまとめる: `default_provider` / `chat_defaults`（`ChatOptions`）/ `remote_enabled` / `ntfy_url` / `desktop_notifications` / `dock_badge` / `projects_dir` / `auto_resume_on_reconnect` / `auto_archive_days` / `voice_enabled` / `voice_provider` / `voice_language` / `voice_model` / `voice_openai_base_url` / `voice_openai_model` / `pre_compact_prompt` / `post_compact_prompt` / `pre_compact_enabled` / `post_compact_enabled`（圧縮前指示・圧縮後指示の共通の分と、送るか）。選択はチャット → プロジェクトの `chat_defaults` → 設定の `chat_defaults` の順に、同じ形を重ねて決める（`resolveChatOptions`）。

### DB を作り直したときの画面の状態

ID 入りの localStorage のキー（グループの開閉・下書き・送信待ちの表示など）は、新しい DB の別のものを指してしまう。画面は起動したときに `/api/status` の `database_id` と覚えている値を比べ、違えば ID 入りのキー（`storageKeys.ts` で印を付けたもの）を消す。

## 4. ディレクトリ構成

```
src/
  shared/              どのプロセスからも使う型と純粋な関数（Node・DOM・Electron・React に依存しない）。import は @shared/…
    types/             API・SSE・DB の形（chat / chatEvent / chatLive / project / approval / settings / provider / git / github / voice / docker / device / events / api）
    github/            GitHub タブの絞り込みと GitHub の検索の文の行き来（searchQuery）・本文の画像のリポジトリのファイルの見分け（repoImage）
    chat/              チャットの決まり（状態と列 state・サブエージェントの一覧 subagents・選択の解決 chatOptions・送信待ちの印 queueStops・失敗の見分け・AI への定型文）
    project/           プロジェクトの決まり（タグ・色）
    memo/              メモの名前の決まり（ファイル名に使える形・重ならない名前・チャットから作るメモの名前）と種類（Markdown / HTML）
    ipc/               Electron の IPC の取り決め（チャンネル名・画面に出す API の型・中身の型）
    testing/           テストのデータを作る関数（コアと画面のテストで共通）
    errors.ts          errorMessage
  core/                Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）
    index.ts           組み立てと終了（startCore）
    daemon.ts          Electron なしで起動
    bus.ts             変更の知らせ（SSE へ）
    db/                schema・open（開く・版・リリース前の後片付け）・store（表ごとの店をまとめるだけ）・chats・events（記録と全文検索）・projects・groups・queues・snippets（定型文）・settings（設定・秘密・meta）
    http/              server（組み立て・認証・失敗の変換・SSE・画面の配信）・httpServer・auth・errors（NotFound など）・routes/（領域ごとに xxxRoutes）
    chat/              チャットの実行: runner（受付）・turn（1 回の実行）・input・runtime（チャットごとの作業中の状態）・queue（送信待ち）・recovery/（通信の切断・使用枠の上限からの再開）・approvals・fork・rewind・policy（AI への指示と許可）・guard/（書き込みの守り: 参照資料・Kickoff 自身）・transcript・uploads・autoArchive
    providers/         プロバイダーの抽象（types）と実装（claude/）
    git/               Git（exec・status・files・changes・history・worktrees）・GitHub（gh の状態・PR の見張り・アカウントと連携先）・取り込みの点検・ワークツリーの準備
    github/            GitHub タブの読み取り（gh api の GraphQL と REST・応答を形にする normalize・一覧の ETag の覚え）
    usage/             使用状況（Claude のプランの枠と、ほかのサービス services/）
    voice/             音声入力の文字起こし（whisper-cli・macOS の音声認識・OpenAI）と、音声モードの読み上げ（OpenAI の声）
    terminal/          内蔵ターミナルのシェル（TerminalSessions。この Mac の画面は IPC、スマホは WebSocket でつなぐ）と、AI に出力を読ませる口（TerminalControl）
    docker/            Docker タブ（一覧・操作・エンジンの状態・見ている間だけの docker events・compose のファイル・ポートの取り合い・ログ・AI の守りが見る様子・「DB で開く」の案。表は持たない）
    memos/             プロジェクトのメモ（プロジェクトの外のフォルダの Markdown・HTML の一覧・読み書き・移動・ゴミ箱・チャットの文から作る・HTML のメモが読むファイルを返す）
    notifications/     通知の判断（だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）・見ているもの・通知の中身
    platform/          OS ごとに違う処理の口（HostPlatform: ゴミ箱・アプリを開く・待っているソケット・プロセスの表・ログインシェルの PATH・音声認識など）と macOS の中身（macos/）。メイン・daemon が作って startCore に渡す
    system/            外部コマンド・パス・期限付きキャッシュ・保存先と名前（appEnv）・開発版のデータの写し
    testing/           テストの補助（サーバーの準備・偽のプロバイダー・一時フォルダ・Git の作業場所）
  main/                Electron のメインプロセス
    index.ts           起動の順番だけ
    app/               ウィンドウ・メニュー・終了の片付け・子の Electron・権限の問い合わせ・起動の記録
    ipc/               IPC の登録と引数の検査
    platform/          OS ごとに違う処理の口を 1 か所で選ぶ（コアと共通の hostPlatform（内蔵ターミナルのシェルも）・メインだけの desktopPlatform: 外部のターミナル・ブラウザ）と macOS の中身（macos/）
    browser/  terminal/  notifications/  diagnostics/
  preload/             画面に出す最小限のネイティブ機能（型は @shared/ipc）
  renderer/src/        画面（React）。import は同じフォルダなら ./、それ以外は @/…
    main.tsx  global.d.ts
    app/               App・ルーター・全体の context（プロジェクト・チャットの状態・ルート）・ショートカット・通知・テーマ・レイアウトの開閉
    api/               サーバーとのやり取り（http・資源ごとの関数・SSE）
    stores/            画面全体で 1 つずつ持つデータ（チャット・グループ・ワークツリー・音声の準備など。1 つの仕組み createStore で作る）
    lib/               React に依存しない小さな補助（cx・time・format・url・highlight・richCopy・表示の設定の保存 storage と、その唯一の一覧 storageKeys）
    hooks/             ドメインを知らない hooks（保存・取得・ドラッグ・Esc など）
    ui/                ドメインを知らない部品（IconButton・Segmented・PopupMenu・dialogs・Field・Markdown・ImageViewer など）
    features/          ドメインごとの部品と hooks
      chat/            チャット全般（状態・操作・名前・メニュー・状態の印・状態ごとの一覧）と、1 つのチャットの画面（pane/ timeline/ messages/ tools/ status/ composer/ options/ attachments/ queue/ subagents/ approvals/ prompts/ find/ rewind/）
      chatList/        チャットをまとめて並べる仕組み（まとめ方・数え方・開閉の記憶。サイドバー・ボードの段・パネルのタブのまとまり・⌘⇧A で共通）
      project/         プロジェクト全般（印・札・タグ・色・並び・メニュー）・プロジェクトの画面 page/・編集 settings/・新規 new/
      group/           グループ（並べ替え・ドラッグ・メニュー）
      sidebar/  board/  palette/
      panel/           タブの入れ物（状態 state/・ペインの分割 layout/・タブ tabs/・まとまり clusters/・欄 bottom/ projectChat/）
      editor/  history/  worktree/  github/  database/  docker/
      settings/  terminal/  browser/  openWith/  dictation/  fileLinks/  footer/  usage/  diagnostics/
    styles/            CSS。index.css の @import の順（＝カスケードの順）でつなぐ。中身は領域ごとのサブフォルダ（base/ ui/ chat/ sidebar/ board/ panel/ editor/ …）
```

依存の向きは `features → stores / api / ui / hooks / lib → shared`、`app → features`。`ui` / `hooks` / `lib` は `features` を import しない。`core` と `renderer` は互いに import せず、共有するものは `shared` に置く。

## 5. 共通化の対象

調査（領域ごとに 7 つ）で見つけた「同じ仕組みの別実装」のうち、効果の大きいものから入れる。

### コア
1. 記録の型を判別共用体に（`.data as` 50 か所をなくす）。
2. チャットごとの作業中の状態を 1 つに（いまは 9 つのクラスに 23 個の入れ物）。詳細と SSE は同じ形 `ChatLive`（送信待ち・裏の作業・再試行・再接続待ち・圧縮中・停止中）を 1 つの知らせ `chat_live` で配る。
3. 通信の切断と使用枠の上限からの再開を 1 つの仕組みに（保留・聞く・再開・時計・後始末が同じ形の 2 実装。送信待ちの保留の持ち主が 2 つあって止まったままになる不具合も消える）。
4. ルートの前処理と失敗: `:id` の引き当てをミドルウェアに、作業中なら 409・作業場所の解決・失敗の例外（NotFound / Conflict / Invalid）を 1 か所で変換。応答の形をそろえる（変えたら資源を返す、送信待ちは `QueueState`）。
5. 選択（モデル・深さ・権限・ファスト）を `ChatOptions` 1 つに。AI への定型文を 1 か所に。
6. Git・外部コマンドの小さな重複（HEAD の有無・remote・ワークツリーの引き当て・stderr の文・実行ファイルの探し方）。
7. Store の委譲だけのファサードをやめ、表ごとの店（`store.chats.get` など）を直接使う。

### 画面
1. データの店: チャットの一覧（いまは 8 か所で別々に取得）・グループ（4 か所）・ワークツリー・音声の準備・プロバイダーなどを、1 つの仕組み（`createStore`）で画面に 1 つずつ持つ。
2. 保存: localStorage の hooks（9 個・2 つのエンジン）を、部品どうしでそろう 1 つのエンジン（`defineSetting` ＋ `useSetting`）に。
3. チャットのまとめ方・数え方・開閉（サイドバー・ボードの段・パネルのタブのまとまり・状態ごとの一覧・⌘⇧A の 8 実装、開閉の記憶 9 方式）を `chatList/` の 1 つの仕組みに。
4. パネル: 3 つの欄の違いを 1 つの欄の設定（`SURFACES`）に、タブの種類の違いを 1 つの表に、`usePanel` の状態の更新を純粋関数に。
5. チャットの画面: 子の部品への操作の配り方（props・4 つの context・ref・クラス名での DOM 検索）を 1 つの context に。押すと上に開く一覧（9 か所）・キー操作（Enter と日本語入力・Esc・ピントの判定）・書き直しの欄・添付のボタン。
6. 汎用: ポップオーバー（`Popover`）、メニューは描いてから測って画面に収める（手での大きさの見積もり 22 か所をなくす）、つまみのドラッグ（`useDragSize`。6 実装）、操作の実行中と失敗（`useAction`）。
7. API の窓口を資源ごとに分け、応答の型は `shared/types/api.ts` に（画面側の手書きをなくす）。

### メイン・テスト
1. IPC の取り決め（30 本のチャンネル名と型の二重書き）を `shared/ipc` に。登録は型付きの補助で、引数の検査もそこで。
2. 診断の DB の集計をコアへ（メインが生の SQL を流していた）。
3. テストのデータを作る関数（`Chat` を作る関数が 9 ファイル、記録が約 10 ファイル）と、一時フォルダ（片付けない所が多い）・Git の作業場所の準備を共通に。1,000 行を超えるテストを分ける。

## 6. 手順

各段で `npm run typecheck`・`npm test`・`npm run knip`・`npm run build` を通してコミットする。見た目を変えないはずの段は、開発版で `scripts/ui-snapshot.mjs` の前後を比べる。

1. 設計書（この文書）
2. ディレクトリ構成を移す（ファイルを移し、import を書き換える。エイリアス `@shared` / `@`。CSS はサブフォルダへ、順は保つ）
3. 語彙をそろえる（Run → Chat など。型を理解する道具で参照ごと改名し、SQL・API のパス・SSE の種類・CSS のクラスは文字で置き換える）
4. スキーマを作り直す（3. のスキーマ・DB 層・記録の判別共用体・設定・リリース前の後片付け）
5. コアの共通化（5. のコア）
6. 画面のデータ層（店・保存・API）
7. 画面の部品（まとめ方・パネル・チャットの画面・汎用の部品）
8. メインと IPC・テストの補助
9. CLAUDE.md を決まりだけにし、説明をフォルダごとへ
10. 開発版で動かして確かめる（古い DB の後片付け・主な画面と流れ）

## 7. 調べて見つけた不具合

直すものは、リファクタとは別のコミット（`fix:`）にする。共通化で自然に消えるものは、その段で消えたことを確かめる。最後の報告に、直したもの・残したものを一覧にする。

## 8. 到達点（2026-11-05）

6. の手順はすべて終えた（main に約 100 コミット。プッシュはしていない）。設計から変えた所・足した所:

- 作業中の様子は `ChatLive`（`shared/types/chatLive.ts`）1 つにし、SSE は `chat_live` 1 種類で配る（書いている途中の返答 `chat_delta` とサブエージェントの途中経過 `chat_subagent` は回数が多いので別のまま）。チャットごとの状態はコアの `chat/runtime.ts` の `ChatRuntime` が持つ。
- 止まったあとの再開（通信の切断・使用枠の上限）は `core/chat/recovery/` の 1 つの仕組み（流れ `recovery.ts`・理由ごとの違い `rules.ts`）。AI へ送る定型文は `shared/chat/prompts.ts`。
- HTTP の失敗は `core/http/errors.ts` の `Invalid` / `NotFound` / `Conflict` を投げ、`onError` で応答にする。`:id` の引き当ては `core/http/lookups.ts` のミドルウェア。変えたら資源を返し、返すものがなければ 204。
- 画面のデータは `stores/` の `createStore` / `createKeyedStore`（チャット・グループ・ワークツリー・プロジェクト・回答待ち・設定・使用枠・音声・プロバイダー）。表示の設定は `lib/storageKeys.ts` の `defineSetting` と `useSetting`（宣言していないキーは起動したときに消し、DB の `database_id` が変わったら ID 入りのキーを捨てる）。
- 汎用の部品: `ui/Popover`、自分で測って画面に収める `PopupMenu` と `useContextMenu`、`hooks/useDragSize`（横に並べた欄の幅と覆うのは `hooks/useCoverableWidth`）、`hooks/useFold` と `ui/FoldHead`、`hooks/useAction`、`hooks/useMultiSelect`。チャットのまとめ方は `features/chatList/` の `bucketChats`。パネルの欄の違いは `features/panel/surfaces.ts` の `SURFACES`、タブの種類の違いは `tabs/tabKinds.ts` の `TAB_KINDS`、状態の変え方は `state/panelState.ts` の reducer。チャットの画面の操作は `features/chat/pane/chatPaneContext.ts` の 1 つの context。
- IPC は `shared/ipc/contract.ts` の表 `NATIVE_API` 1 つから、preload の `window.kickoff`・画面の型・main の型付きの登録（送り手と引数の確かめ）を作る。
- テストのデータは `shared/testing/factories.ts`、一時フォルダ・Git の作業場所・コアの準備は `core/testing/`。
- CLAUDE.md はルートを決まりだけにし、説明は各フォルダの `CLAUDE.md` に分けた。

やらなかったこと（次の候補）: 添付の表（いまは uploads/ のファイルだけで、チャットを消しても添付は残る）、使っていない設定（`remote_enabled`・`ntfy_url`・`default_provider` の画面）の整理、アーカイブ済みのチャットをプロジェクトごとに読むこと、最新の結果だけを使う取得の手書き（Git の状態・チャットの詳細・検索）の共通化。

