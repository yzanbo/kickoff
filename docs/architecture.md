# Kickoff の設計（2026-11 の作り直し）

> 2026-11-04 に、リリース前の作り直しとして決めた設計。語彙・名前の決まり・ディレクトリ構成・共通化の対象を書く（スキーマは `src/core/db/schema.ts`）。
> 書き方の決まりはリポジトリの `CLAUDE.md`、機能ごとの説明は各フォルダの `CLAUDE.md` にある。

## 0. 決めたこと

| 項目 | 決定 |
|---|---|
| 保存データ | 引き継がない。リリース前の版の DB は開かずに例外にする（消す・写すコードは持たない） |
| 古い仕組み | v17 からの変換（`legacyMigration` / `legacyValues`）と、版を上げる前の写し（`dbBackup`）はなくす。localStorage の以前の値の読み替えもなくす |
| 見た目・動き | 共通化に伴う小さな統一はしてよい（場所ごとに少しずつ違う見た目・動きを、共通の部品に寄せて 1 つにする）。変えたものは最後に一覧で報告する |
| 機能 | 使っていない機能・設定も消さない（候補は報告にだけ書く） |
| CLAUDE.md | ルートは書き方の決まり・置き場所・確かめ方だけ。機能の説明はそのフォルダの `CLAUDE.md`（そこを触るときだけ読まれる）へ |
| 進め方 | main で、区切りごとにコミット。各段で typecheck・test・knip・build を通す |

## 1. 語彙

画面の言葉とコードの名前を 1 対 1 にする。

| 画面の言葉 | コード |
|---|---|
| チャット | `Chat` / 表 `chats` / `chat_id` |
| 1 回の実行（送ってから終わるまで） | `Turn`（`executeTurn` / `TurnOutcome` / `TurnControl`） |
| Kickoff のコア（別のプロセス）とその様子（起動中・動いている・起動し直している・止まった・応答しない。画面の上の帯） | コアのプロセスの見張り役 `CoreProcess`（`main/app/coreProcess.ts`）・様子 `CoreState`（`CORE_STATES`）・やり取りの形 `core/host/protocol.ts`（`CoreInit` / `CoreReady` / `CoreMethods` / `HostMethods`） |
| チャットの記録 | `ChatEvent` / 表 `chat_events` |
| グループ | `ChatGroup` / 表 `chat_groups` |
| 定型文（チャット欄の中の上の帯から入れる・送る、よく使う指示。共通かプロジェクトだけ） | `Snippet` / 表 `snippets`（`project_id` が NULL = 共通）・`features/snippet/` |
| 音声入力（マイク。話した言葉を文字にして入力欄に入れる）・音声モード（波形。話し終わったら送るか入力欄に入れ、AI の返答を声で読み上げる会話） | `useDictation` / `useVoiceMode`・`VoiceSession`・読み上げ `Speaker`（`features/dictation/`）・コアの `VoiceService` |
| 圧縮前指示（会話を圧縮する前に AI に送る指示。メモを残してもらうなど。設定の共通の指示 → プロジェクトの指示の順につなぐ。それぞれオン / オフを切り替えられ、オフなら文を残したまま送らない） | 設定・プロジェクトの `pre_compact_prompt` / `pre_compact_enabled`・`@shared/chat/prompts` の `compactPromptFor`・記録の `user.pre_compact`・`core/chat/preCompact.ts`・PreCompact フック `core/providers/claude/preCompact.ts` |
| 圧縮後指示（会話を圧縮したあと、圧縮の間に預かった指示より先に AI に送る指示。メモを読み直してもらうなど。つなぎ方は圧縮前指示と同じ） | 設定・プロジェクトの `post_compact_prompt` / `post_compact_enabled`・`@shared/chat/prompts` の `postCompactMessage`・記録の `user.post_compact`・送信待ちの `QueuedMessage.post_compact`・`core/chat/preCompact.ts` の `postCompactItem` |
| プロジェクトフォルダ（プロジェクトに登録したフォルダ。AI が作業する所。git のリポジトリの中のフォルダでもよい。「フォルダ」「プロジェクトのフォルダ」「本体のフォルダ」とは呼ばない。ワークツリーと並べるときだけ「本体」） | `Project.repo_path`（`PUT /api/projects/:id/repo-path`・`changeProjectFolder`。AI へはシステムプロンプトの「プロジェクトフォルダ」） |
| 作業フォルダ（そのチャットの AI が実際に作業する所。本体で作業するならプロジェクトフォルダ、ワークツリーならその中の同じ位置） | `workdirOf(chat, project)`（`chat.worktree_path ?? project.repo_path`） |
| メモフォルダ（「メモ」タブのメモを置くフォルダ。プロジェクトフォルダとは別の場所で、プロジェクトフォルダを変えても変わらない） | `MemoService.dirOf(project)`（`memo_path` か、設定の `memos_dir` の下の `memo_folder`） |
| 送信待ち | `Queue`（`chat_queues`） |
| 添付（チャットの指示に添えるもの。種類 = ファイル（📎・ドラッグ・貼り付け）/ メモ（付けたときの写し）/ 取ったもの（「AI に渡す」で押したときの中身をファイルにしたもの）。中身は送らず、パスと見出しを書き添えて AI が Read で読む） | `Attachment`（`kind`: `file` / `memo` / `capture`）・取ったものの出どころ `AttachmentSource`（`type` は `ATTACHMENT_SOURCE_TYPES`）・`POST /api/captures`・`POST /api/projects/:id/memo/snapshot`・`UploadStore`（`core/chat/uploads.ts`）・見出し `core/chat/attachmentNotes.ts`・鍵を伏せる `@shared/secrets/redact` |
| AI に渡す（各タブの 1 つのもの（issue・PR・CI の落ちたステップのログ・DB のつながらない様子・ブラウザのタブの画面とコンソール・ターミナルで選んだ長い文など）を、押した時点の中身の札にしてチャットの入力欄に一言と入れる。渡し先 = 新しいチャットで始める / このチャットに追加 / 新しい子チャットで聞く / ほかのチャットに追加。送るのは自分で） | 渡すもの `HandOffItem`・渡し先 `HAND_OFF_TARGETS`（`features/chat/handoff/handOff.ts`）・ボタン `HandOffButton`（「AI に渡す ▾」）・ブラウザの中身はメインプロセスの `agentBrowser.handOffCapture`（`@shared/ipc` の `BrowserHandOffCapture`）・画像の札は `POST /api/captures` の `image_base64` |
| 起動したときの再開の確かめ（前回の終了で、作業の途中で止まったチャットと、自動で送るまま残った送信待ちを、起動してから続けるか・送るか聞く。送る / 続ける・続けてから送る / 止めておく・止めたまま / あとで） | `RestartResume` / `RestartResumeAction`（確かめを待つ印は `ChatLive.restart_resume`（`RestartResumeState`）、DB の印は `chats.resume_pending`。`GET\|POST /api/restart-resumes`・`Runner.restartResumes`・画面の `RestartResumeDialog` / `RestartResumeBanner`・店 `stores/restartResumes.ts`） |
| 送信待ちに挟む行（会話の圧縮・コンテキストの消去） | `QueueAction`（`compact` / `clear`。`QueuedMessage.compact` / `clear`・`@shared/chat/queueActions`） |
| コンテキストの消去（これまでの会話を AI に引き継がず、次から新しい会話で始める。記録は残す） | `Runner.clearContext`・記録 `context_cleared`（巻き戻し・子チャットの引き継ぎはこの境目を越えない `core/chat/sessionPoints.ts`） |
| 作業場所を移した区切り（チャットの作業場所（本体 / ワークツリー・プロジェクト・フォルダ）が変わった所。会話は新しいセッションに写して続け、これより前の発言は巻き戻せず、分岐の起点にもできない） | 記録 `workplace_moved`（`from` / `to` は `WorkplaceRef`・理由 `WorkplaceMoveReason`）・移す処理 `core/chat/workplaceMove.ts` の `moveChatWorkplace`（`Runner.moveWorkplace`。画面から移すのは `core/chat/workplaceUserMove.ts`・`POST /api/chats/:id/workplace`）・決まり `@shared/chat/workplaceMoves` |
| 作業中の様子（保存しない） | `ChatLive` |
| 末尾（チャットを開くときに読む最新のターン。ターンの境目は作業の終わり） | `tail`（`GET /api/chats/:id?tail_turns=`・`CHAT_TAIL_TURNS`・`core/chat/chatLogQuery.ts` の `tailStart`） |
| 索引（末尾より前の記録のうち、記録全体から作るもの（サブエージェントの一覧・ToDo・図・指示の履歴など）が要るものだけを軽くしたもの） | `index`（`ChatDetail.index`・`@shared/chat/chatIndex` の `selectIndexIds` / `ChatEventMeta`・覆う索引 `idx_chat_events_meta`） |
| 途中の一部分（遠い発言へ移るときに読む、末尾とつながっていない記録のまとまり） | `focus`（`GET /api/chats/:id/events?around=`・`ChatEventPage`） |
| チャットの店（開いているチャットの中身を、部品の外にチャットごとに 1 つ持つ画面の店。同じチャットを何か所で開いても読み込みと SSE は 1 回）と口（部品が購読する用途ごとの入口: 詳細・記録・途中の文・サブエージェントの途中経過） | `features/chat/store/`（`createChatStore`・口 `detail` / `log` / `streaming` / `progress`・hook `useChatContent` / `useStreamingActive` / `useChatStreamGen` / `useChatProgress`） |
| 書きかけの返答（作業中に、確定する前の AI の文。画面では「書いている途中の返答」）と、その世代（消すたびに進む。確定した返答と同じ描き直しで入れ替える） | コアの `StreamingTexts`（`Bus.streamingText`・詳細の `streaming_text` / `streaming_length`・`chat_delta` の `offset`）・画面の店の `streamGen` / `streamText` |
| フィード（全プロジェクトの画面の、チャットごとのメインエージェントの最新の返答 1 件を新しい順に並べたもの） | `FeedItem`（`GET /api/feed`・`store.events.feed`・画面の `FeedList` / `useFeed`） |
| チャットの選択（モデル・深さ・権限・ファスト） | `ChatOptions`（`model` / `effort` / `permission_mode` / `fast_mode`） |
| 権限モード | `PermissionMode` |
| AI（チャットを動かす CLI。チャットごとに決め、途中では変えない） | `ProviderId`（`PROVIDER_IDS`・名前 `PROVIDER_LABELS`）・`AgentProvider`・チャットの `provider` |
| AI によってできること・できないこと（できないものは理由付きで押せない） | `ProviderFeature`（`PROVIDER_FEATURES`・`providerFeatureMissing`。`ProviderStatus.features`） |
| Kickoff の守りをツールの形によらず当てる（承認の頼みで聞いてくる CLI 向け） | `judgeCommand` / `judgeWritePath` / `judgeReadPath`（`core/chat/guard/judgeTool.ts`。`GuardVerdict`）・承認の決まり `guardOutcome` / `modeOutcome`（`core/providers/guardedApproval.ts`。`ApprovalOutcome`） |
| Codex の会話と 1 回の実行 | スレッド（= セッション ID）・ターン（= 分岐の起点）・`CodexProvider`（`core/providers/codex/`。`codex app-server`） |
| GitHub Copilot の会話と 1 回の実行 | セッション（= セッション ID）・最後の記録のイベント（= 分岐の起点）・`CopilotProvider`（`core/providers/copilot/`。`@github/copilot-sdk`） |
| ACP のエージェント（Cursor・Gemini）の会話と 1 回の実行 | ACP のセッション（= セッション ID）・指示（`session/prompt`）・CLI ごとの違い `AcpProviderSpec`（`CURSOR_SPEC`・`GEMINI_SPEC`）・`AcpProvider`（`core/providers/acp/`）・標準入出力の JSON-RPC の口 `StdioRpc`（`core/providers/stdioRpc.ts`。Codex と共有） |
| AI のログインの仕方（サブスク / API キー）と API キーの置き場 | 設定の `provider_auth`（`ProviderAuthMode`）・`ProviderKeyVault`（`core/providers/keys.ts`）・`ProviderTurnParams.auth`・画面の `ProviderAuthSettings` |
| 画面でのチャットの AI（選ぶ札・見せる札・その AI にない機能の理由・前に出しているチャットの AI） | `features/chat/provider/`（`ProviderPicker` / `ProviderChip`・`ChatProviderContext` / `useFeatureBlock`・`noteForegroundProvider` / `useForegroundProvider`） |
| AI の操作ツール（埋め込みブラウザ・DB・チャットのツールを、どの AI の CLI にも同じに出す。1 回の実行ごとの鍵で、その実行に決めたツールだけ） | コアの MCP サーバー `McpToolHost`（`core/mcp/host.ts`。口 `/mcp/<名前>`）・サーバー `ToolServer`・ツール `ToolDef`（`defineTool`）・CLI に渡す口 `ToolEndpoint`（`ProviderTurnParams.tools`） |
| AI のブラウザ操作（チャットの AI が Kickoff の埋め込みブラウザのタブを見る・操作する。操作中のタブには「AI 操作中」の印） | 口 `BrowserControl`（`core/browser/`）・ツール `kickoff_browser`（`browserToolServer`。コアの MCP サーバー `core/mcp/`）・実装 `agentBrowser`（`main/browser/`）・IPC `agentBrowser`・印 `useAgentBrowsing` |
| AI が作るチャット（チャットの AI が、頼まれて子チャット・兄弟チャット・親のないチャットを（新しいワークツリーでも）作って依頼を送る。毎回聞く / 聞かずに作る / 作らせない。AI が作った世代は 2 世代目まで） | ツール `kickoff_chat`（`create_chat`。`chatToolServer`（コアの MCP サーバー `core/mcp/`）・名前は `@shared/chat/aiCreateChat` の `AI_CREATE_CHAT_TOOL`・作る場所 `AiChatRelation`（`child` / `sibling` / `root`。`AI_CHAT_RELATION_LABELS`））・中身 `AiCreateChatTools`（`core/chat/aiCreateChat.ts`）・設定 `ai_create_chat`（`AiCreateChatMode`: `ask` / `allow` / `off`。v29 で `ai_child_chat` から付け替えた）・世代 `chats.ai_generation`（v29。店の中だけ `store.chats.aiGeneration`） |
| 家系（いちばん上の親チャットから下にぶら下がるチャットの全部。チャットの AI が固定・グループを聞かずに変えられる範囲。名前は家系の外でも同じプロジェクトなら変えられる） | ツール `kickoff_chat` の `list_family_chats` / `update_chat`（名前は `@shared/chat/aiChatEdit` の `AI_LIST_FAMILY_TOOL` / `AI_UPDATE_CHAT_TOOL`・引数 `UpdateChatInput`）・中身 `AiChatEditTools`（`core/chat/aiChatEdit.ts`）・関係の呼び名 `familyRelation`（`core/chat/chatFamily.ts`） |
| AI が開く（チャットの AI がメモ・家系のチャット・ファイル・差分を利用者の画面に開き、SQL を SQL のタブに入れる。右の欄 / 別ウィンドウ / 設定どおり） | ツール `kickoff_chat` の `open_memo` / `open_chat` / `open_file` / `open_diff` / `open_sql`（`chatOpenTools.ts`。名前は `@shared/chat/aiOpen` の `AI_OPEN_MEMO_TOOL` など）・中身 `AiOpenTools`（`core/chat/aiOpen.ts`）・SSE の `open_view`（`OpenViewRequest`・場所 `OpenPlace`: `side` / `window`）・画面の受け口 `useAiOpenRequests`（`renderer/src/app/aiOpenRequests.ts`） |
| AI の下書き（チャットの AI が家系のチャットの入力欄の後ろに文を足す。送るのは利用者） | ツール `kickoff_chat` の `add_draft`（`AI_ADD_DRAFT_TOOL`）・SSE の `chat_draft`（`ChatDraftRequest`。親チャットに入れるなら札 `from`）・画面の受け口は同じ `useAiOpenRequests` |
| AI が読む（チャットの AI が同じプロジェクトのチャットの一覧・会話と使用枠・このプロジェクトのターミナルの出力を読む） | ツール `kickoff_chat` の `list_project_chats` / `read_chat` / `get_usage`（`chatReadTools.ts`・`@shared/chat/aiRead`・中身 `AiChatReadTools`（`core/chat/aiChatRead.ts`）・やり取りへの分け方 `conversationTurns`（`core/chat/conversation.ts`））と `list_terminals` / `read_terminal`（`chatTerminalTools.ts`・`@shared/chat/aiTerminal`・中身 `AiTerminalTools`（`core/chat/aiTerminal.ts`）・読み取りの口 `TerminalControl`（`core/terminal/control.ts`。中身はコアの `TerminalSessions`）） |
| AI が足す・変える（チャットの AI がこのプロジェクトの定型文に足す・メモの名前を変える／移す） | ツール `kickoff_chat` の `add_snippet` / `move_memo`（`chatProjectTools.ts`・`@shared/chat/aiProject`）・中身 `AiProjectTools`（`core/chat/aiProject.ts`） |
| 図（チャットの AI が返答の中に描く SVG・HTML・Mermaid の図。文の間に閉じた枠で出し、その場で描き直せる。図の中のボタンから利用者が押したときだけ発言を送れる） | `Visual`（ツール `kickoff_chat` の `visual_guide` / `show_visual` / `update_visual`（`chatVisualTools.ts`・`@shared/chat/aiVisual`。種類 `VisualKind`・図の ID `visual_id`・記録から組み立てる `collectVisuals` → `ChatVisual`）・中身 `AiVisualTools`（`core/chat/aiVisual.ts`）・枠のページ `/visual-frame`（`@shared/chat/visualDocument`）・`ChatLive.drawing_visual`・画面 `features/chat/visuals/`） |
| 数式（返答・メモ・GitHub の Markdown の数式を KaTeX で描く。$$…$$・\(…\)・\[…\]・数式らしい $…$） | `@shared/markdown/mathGuard`（`looksLikeMath` / `isSingleDollarMath` / `mathRanges`）・画面 `ui/markdown/math/`・メモ `features/memo/liveRich.ts`（Mermaid の塊も図にする） |
| ゴミ箱（Kickoff の中のゴミ箱。消したもの（AI の rm の代わりの kickoff-trash・画面の「ゴミ箱に入れる」・チャット・プロジェクトの削除）を 3 日取っておき、元に戻せる。OS のゴミ箱とは別。メモの仕様書「ファイル削除」） | `TrashItem` / 表 `trash_items`（v26。種類 `TrashKind`: `file` / `chat` / `project` / `session` / `worktree`（消したワークツリーの控え。Git の参照 `refs/kickoff/trash/<id>/branch|changes`））・置き場はデータのフォルダの `trash/<id>/item/`・`TrashService`（`core/trash/`）・`GET /api/projects/:id/trash`・`POST /api/trash/:id/restore`・SSE `trash`・Kickoff が作ったセッションの覚え（表 `agent_sessions`。v28） |
| 未読 / 既読 | `unread` / `read` |
| タブの入れ物（右のパネル・チャット欄・下のパネル・右の欄） | `Panel`（`usePanel`） |
| 右サイドバー（画面の右端の欄。右端のアイコンの列で、ブラウザとプロジェクトのタブと同じ画面（メモ・ファイル・検索・変更・履歴・DB・Docker・GitHub・CI・ゴミ箱）を切り替える。コードでは「チャット欄」`side`。チャットのパネルはチャットだけ・下のパネルはターミナルだけ） | `surface: "side"`（`useProjectChat` ＋ `ProjectChat`） |
| 右サイドバーの中身（右端のアイコンの列で選ぶもの。プロジェクトごと） | `SideView`（`browser` か、プロジェクトのタブの名前。設定 `sideView`・`features/panel/projectChat/sideView.ts`）・右端の列 `SideRail`・中身 `SideBody` / `SideViewBody` |
| 右の欄（チャットの画面の右に、サブエージェントの画面を並べる欄。チャットのタブの中に入れ子にしたタブの入れ物） | 欄 `agents`（`SURFACES.agents`・`AgentSplit`）・タブの種類 `subagent`・画面 `SubagentScreen` |
| チャットタブ（チャットをボードと分けて横幅いっぱいに開くプロジェクトのタブ。設定でボードの右のパネルにも戻せる） | タブ `chats`（`#/projects/:id/chats`）・`ChatsTab`・置き方の設定 `CHAT_PLACEMENT`（`separate` / `together`）。中身はボードの右のパネルと同じ `kanban:<プロジェクト>` のパネル |
| メモ（プロジェクトの「メモ」タブ。プロジェクトの外のフォルダの Markdown か HTML（HTML のメモ = HTML と CSS で書くページ。描いた見た目で見る）） | メモのフォルダ（設定 `memos_dir` の下の、プロジェクトの `memo_folder`。別の場所なら `memo_path`）・`MemoService`（`core/memos/`）・`MemoTab`（`features/memo/`） |
| メモのチャット（メモの右の欄で話す、メモごとに 1 つのふつうのチャット。一覧には並べず、そのメモの右の欄から開く。AI はメモのファイルを直接読み書きする） | `Chat` の `memo_path`・`POST /api/projects/:id/memo/chat`・`MemoChat`（`features/memo/`） |
| 子チャット（チャットの発言から「新しい子チャットで聞く」・右の欄の「＋」の「新しい子チャット」で始める横道の質問。親の中にだけ置き、いちばん上の親の右の欄か別ウィンドウで開く（設定 `CHILD_CHAT_OPEN_IN`。作ったときは `CHILD_CHAT_OPEN_ON_CREATE` で、開かないも選べる）。孫・ひ孫も作れる。サブエージェントの「伝える」で「新しい子チャットで聞く」を選ぶと、そのサブエージェントの会話の記録を添えた子チャットになる） | `Chat` の `parent_chat_id`（親）・`parent_event_id`（聞いた発言）・`startChildChat`（`core/chat/children.ts`）・`startSubagentChildChat`（`core/chat/subagentChild.ts`）・`features/chat/children/` |
| 親から外す（子チャットを親のないチャットにする・孫より深いものを自分の先祖の子に上げる。付け替えはしない。子孫はついていく） | `POST /api/chats/:id/detach`（本文 `ChatDetachBody`）・`detachChat`（`core/chat/detach.ts`）・`store.chats.detach`・AI の `update_chat` の `parent_id` |
| 親への依頼文（子チャットの AI に、親チャットの AI へ渡す依頼文だけを書いてもらう頼み。発言の印 = 依頼文の頼み）・親チャットに追加（子チャットの作業の最後の返答を、そのまま直接の親に渡す。渡し方 = 入力欄 / 今すぐ送る / 送信待ち、渡したあと = そのまま / アーカイブ / 削除）・渡したことの印 / 出どころの札 | 頼み方の文 `handoffRequestPrompt`・最後の返答 `lastReplyOfTurn`（`@shared/chat/handoff`）・発言の印 `MessageMarks`（`handoff_request` / `handoff_from`）・渡し方 `HandoffVia`・渡したあと `HandoffAfter`・`POST /api/chats/:id/handoff`（`core/chat/handoff.ts`）・記録 `handoff`・`features/chat/children/handoff.ts` |
| 見え方（チャットの流れの、記録ではない状態。開いているツール・カード・思考などの開閉、測った行の高さ、読んでいた位置。チャットの画面を作り直しても残し、最近の 50 チャットまでメモリだけに持つ。記録の店とは分ける） | `TimelineView`（`features/chat/timeline/timelineView.ts` の `createTimelineViews` / `timelineView` / `useTimelineOpen`） |
| 会話 / 動き（チャットの画面の見え方。動き = メインエージェントとすべてのサブエージェントの動きを 1 本の時系列に） | `ChatShowing`（`conversation` / `activity`）・`ActivityRow`（`features/chat/activity/`） |
| GitHub タブ（プロジェクトの画面の上のタブで、連携先のリポジトリの issue・PR を「issue｜PR」で切り替えて見る・書く・AI に渡す。チャットの右の欄にも開ける。要件定義書の「5.11 GitHub」。段階 1「読む」・段階 2「AI に渡す」・段階 3「書く」まで作った。PR のチェックの「ログを開く」は CI のタブへ） | タブ `github`（`#/projects/:id/github`）・右の欄のタブの種類 `github`・画面 `features/github/`・コア `core/github/`（gh api の GraphQL・REST。ワークツリーの PR の見張り・push の `core/git/github.ts` はそのまま）・HTTP `/api/projects/:id/github/…` |
| 連携先（PR・issue を見る GitHub のリポジトリ。プロジェクトフォルダの git の remote から自動で決める。`gh repo set-default` → `upstream` → `origin`）と、プロジェクトで使う GitHub のアカウント（gh に入っているものから選ぶ。gh の有効なアカウントは切り替えない） | `GitHubRemote`・`GitHubTarget`（`core/git/githubTarget.ts`）・選んだ remote はプロジェクトの `github_remote`・アカウントは `github_account`（`GitHubAccount`・`core/git/githubAccount.ts` の `runAsGitHubAccount`）・ワークツリーの PR を見張るかは `pr_watch`・設定の画面は `ProjectGitHub` |
| 利用者が見ているもの（AI が読む、この Mac の画面のウィンドウの見えているペインごとの前のタブ・右の欄・選んでいる範囲と、発言を送った時点の様子。スマホは入れない） | `UserView` / `UserViewPane` / `UserViewTab`（`@shared/types/userView.ts`）・`PUT /api/user-view`・送る本文の `user_view`・`UserViewRegistry`（`core/userView/`）・ツール `get_user_view`（`AI_GET_USER_VIEW_TOOL`）・画面 `app/userViewCollect.ts`・`app/userViewReport.ts` |
| AI からの知らせ（AI が長い作業の途中で区切り・あとで見てほしい判断を利用者に届ける。この Mac の通知は本文、スマホのプッシュは本文なし） | ツール `notify_user`（`@shared/chat/aiNotify` の `AI_NOTIFY_USER_TOOL`）・中身 `core/chat/aiNotify.ts`・SSE（バス）の `ai_notice`・通知の種類 `NoticeKind` の `ai_notice`（`aiNotice`） |
| 作業場所を移す予約（AI が自分のチャットの作業場所を移すよう頼む。作業が最後まで終わったら Kickoff が移し、続きの指示を送る。作業中の様子に出て取り消せる） | ツール `move_workplace` / `cancel_workplace_move`（`@shared/chat/aiWorkplace` の `AI_MOVE_WORKPLACE_TOOL` / `AI_CANCEL_WORKPLACE_MOVE_TOOL`）・中身 `core/chat/aiWorkplace.ts`・予約 `WorkplaceReservations`（`core/chat/workplaceReservation.ts`）・作業中の様子 `ChatLive.workplace_move`（`WorkplaceMoveReservation`）・取り消し `DELETE /api/chats/:id/workplace-move`・続きの発言の印 `workplace_continuation` |
| AI のアーカイブ・削除（AI が同じプロジェクトのチャットを子孫ごとアーカイブする・Kickoff のゴミ箱に入れる。頼まれたときだけ。自分・自分の祖先は作業の終わりに行う予約） | ツール `archive_chat` / `delete_chat`（`@shared/chat/aiChatRemove` の `AI_ARCHIVE_CHAT_TOOL` / `AI_DELETE_CHAT_TOOL`）・中身 `ChatRemover`（`core/chat/aiChatRemove.ts`） |
| ワークツリーの後始末（ワークツリーを消す。画面の「消す」と AI の finish_worktree。消す前の確かめ・失うものの控え（3 日）・ワークツリー自身のチャットからの予約）・取り込み済み（ローカルで本体のブランチに入っている / GitHub で PR がマージ済み）・控え（消す前に失うものを入れておく Git の参照） | `WorktreeFinisher`（`core/worktrees/finish.ts`）・控え `core/worktrees/backup.ts`・結果の文 `core/worktrees/report.ts`（`MergeState`）・ツール `finish_worktree`（`@shared/chat/aiWorktree` の `AI_FINISH_WORKTREE_TOOL`） |
| ワークツリーの PR の知らせ（ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられたこと。印と 1 つの確認で片付けを聞く） | `WorktreePrNotice`・見張り `WorktreePrWatch`（`core/git/prWatch.ts`）・閉じた確認の表 `pr_notice_dismissals`・画面 `features/worktree/prNotice/` |
| CI のタブ（プロジェクトの画面の上のタブ「CI」（「GitHub」の隣）。GitHub Actions の実行の一覧・ジョブとステップのログ・AI に渡す・やり直す。外の CI は成否とリンクだけ。この Mac のアプリの中だけ。要件定義書の「5.15 CI の結果」） | タブ `ci`（`#/projects/:id/ci`）・画面 `features/ci/`・コア `core/github/ci.ts` の `CiService`（読み方は純粋な `ciNormalize.ts`）・HTTP `/api/projects/:id/ci/runs/…`（端末には開かない）・共有の型 `@shared/types/ci.ts`（実行 `CiRun`・ジョブ `CiJob`・ステップ `CiStep`・状態 `CiState` / `CI_STATES`・外の CI `CiExternalCheck`） |
| CI の失敗の知らせ（作業場所のブランチと既定のブランチで落ちた実行を Mac の通知で。同じ実行は 1 回だけ） | プロジェクトの `ci_watch`（v21）・知らせた実行 `ci_failure_notices`（v21。店 `store.ciNotices`）・PR の見張りの `alsoCheck` で `CiService.watch`・SSE `ci_failed`（`CiFailure`）・出すかの判断はコアの `core/notifications/center.ts`・通知の ID `kickoff-ci:`（`notifications.onOpenCi`） |
| issue・PR の結び付き（どの issue・PR のためのチャットか。カード・見出しに `#番号`。GitHub タブの「AI に渡す」で付く） | `Chat` の `github_repo` / `github_number` / `github_kind`（v19。種類は PR を作るときに「Closes #番号」を足すのを issue だけにするため） |
| DB クライアント（プロジェクトの画面の上のタブ「DB」・チャットの右の欄の ▾ の「DB ▸」・別ウィンドウで開く。接続の一覧・テーブル・SQL・ER 図。要件定義書の「5.12 DB クライアント」） | タブ `db`（`#/projects/:id/db`）・画面 `features/database/`・コア `core/databases/`・HTTP `/api/projects/:id/db-connections/…`（接続元が 127.0.0.1 の頼みだけ受ける） |
| DB 接続（プロジェクトごとに登録する接続。ほかのプロジェクトから写せる） | `DbConnection` / 表 `db_connections`（v13）。パスワードは `secrets` の `db_connection:<id>:password`、AI 用のユーザーのパスワードは `:ai_password`（v14。段階 2 で `:ssh_password`）。値はメインプロセスが渡す `safeStorage` で暗号化したもの（暗号化した印を付ける。`safeStorage` のない単体のコア・テストだけ暗号化せずに置く）。キーチェーンで拒否されて開けないときに利用者が入れたパスワードは、コアのメモリにだけ持つ。接続を消すと、表のトリガー `db_connections_drop_secrets` がその接続の秘密の値も消す（プロジェクトを消したときの連鎖の削除でも効く） |
| DB の種類 | `DbEngine`（`sqlite` / `postgres` / `mysql`。MariaDB は `mysql`） |
| 環境（DB 接続の環境。色・読み取り専用・書き込みの前の確かめ・AI の既定をまとめて決める） | `DbEnvironment`（`local` / `dev` / `staging` / `production`） |
| 書き込む前の確かめ（DB 接続ごと。危険な文だけ / 書き込みのたび / 環境の名前を打つ） | `DbWriteCheck`（`dangerous` / `all` / `env_name`。既定は環境から: ローカル・開発 = `dangerous`、ステージング = `all`、本番 = `env_name`）・接続の `write_check`（v20）。危険な文の判定は `@shared/database/sqlStatements.ts` の `dangerReason` / `writeConfirmation` |
| AI に見せるか（DB 接続ごと。見せない / 承認して見せる / 自由に見せる） | `DbAiAccess`（`none` / `ask` / `allow`。既定は環境から: ローカル・開発 = `allow`、ステージング = `ask`、本番 = `none`）・AI のツール `kickoff_db`（`db_connections` / `db_objects` / `db_describe` / `db_query`。中身は `core/databases/aiTools.ts` の `DbAiTools`、MCP は `core/mcp/dbTools.ts`（コアの MCP サーバー）。すべて聞かずに使わせるもの（`autoAllow`）に入れ、ツールの中で `ai_access` を見て、見せない接続は名前でも断り、承認して見せる接続の `db_query` は承認カードで聞く（権限モードによらず効く））・AI 用のユーザー `ai_username`（v14。あれば AI の SQL だけこのユーザーでつなぐ）・見せない接続の守り（AI がそのホスト・URL・SQLite のファイルを使う Bash と、ファイルのツールで SQLite のファイルを開くのを PreToolUse で断る。`chat/guard/hiddenDb.ts`） |
| ER 図（DB クライアントのタブ。接続と場所（DB・スキーマ）ごとに 1 つ） | タブ `DbErTab`（`lib/dbClientTabs.ts`。まわりを見る中心 `focus`・段の数 `depth`・描くテーブル `names`）・中身 `DbErSchema` / `DbErTable`（`POST …/db-connections/:cid/er`）・関係 `ErRelation`（外部キーと、制約のない関係の推測 `inferred`。多さ `ErCardinality`）・動かした位置 `DbErPositions` / 表 `db_er_layouts`（v15）・店 `store.dbErLayouts` |
| テーブルの絞り込み（テーブルのタブのデータの上の帯。条件か WHERE の式）・行の詳細・書き出し | 絞り込み `DbRowFilter`（条件 `DbFilter`・比べ方 `DbFilterOp` / `DB_FILTER_OPS`・WHERE の式 `where`。タブの `DbTableTab.filter`。SQL は `@shared/database/dbFilter.ts` の `filterSql`）・行の詳細 `TableRowDetail`・書き出しの形 `DbExportFormat`（CSV / TSV / JSON） |
| プロジェクトからの取り込み（DB クライアントの接続の一覧の「プロジェクトから取り込む」） | 見つけた案 `DbImportCandidate`（見つけた所 `DbImportSource` / `DB_IMPORT_SOURCES`: env・compose・prisma・file）・取り込む本文 `DbImportBody`・コア `core/databases/import/`（`scanProjectDbs`）・`GET|POST …/db-connections/import` |
| 接続の手順メモ（つなぎ方（経路）ごとに 1 つのメモ。いくつもの接続で同じメモを使える）・つながらないときの案内 | 接続の `memo_path`（v16。メモのフォルダからの相対パス。`MemoService.move` が `store.dbConnections.remapMemoPath` で付け替える）・置き場所 `DB_MEMO_DIR`（`DB/`）・タブ `DbMemoTab`（`lib/dbClientTabs.ts`）・失敗の種類 `DbFailureKind`（`@shared/database/dbFailure.ts` の `dbFailureKind`・よくある原因 `DB_FAILURE_CAUSES`・「AI に渡す」の一言 `dbFixText` と札の中身 `dbFailureDocument`）・案内 `DbFailureDialog` |
| つなぐ前の準備（つなぐ前に流すコマンド・切るときの後片付け・ポートを転送するコマンド・パスワードを取るコマンド。初めて・中身を変えたあとは確かめてから流す）と次に確かめる日 | 接続の `prep`（`DbPrep`。v18）・確かめたか `prep_confirmed`（確かめていなければ 409 と `DB_PREP_UNCONFIRMED`）・`check_on` / `check_note`・記録 `DbPrepRun`（表 `db_prep_runs`）・いまの様子 `DbPrepState`（ワーカーのメモリだけ）・`{名前}` の埋め方 `@shared/database/dbPrep.ts`・ワーカーの `worker/prep.ts` と `worker/shell.ts`・画面の `ConnectionPrepFields` / `DbPrepDialog` |
| テーブルの行の変更（段階 3 のセルの編集・行の追加と削除・CSV の取り込み。保存するまで画面に持つ） | 変更 `DbRowEdit`（`update` / `insert` / `delete`。行はキー `DbKeyValue` で指し、値は `DbEditValue`）・本文 `DbEditsBody` / 結果 `DbEditsResult`（`POST …/db-connections/:cid/edits`。1 回に `DB_EDITS_MAX` 件まで）・SQL の組み立て `@shared/database/dbEdit.ts`（`editStatements`・行を指す列 `editKeyColumns`）・ワーカーの `apply`・画面の保存していない変更 `TableEdits`（`features/database/tableEdits.ts`）・`useTableEdits` |
| SSH トンネル（踏み台を通して DB につなぐ。初めての踏み台は鍵の指紋を確かめる） | 接続の `ssh`（`DbSsh`: `host` / `port` / `user` / `identity_file`。v17）・パスワード `db_connection:<ID>:ssh_password`（`has_ssh_password`）・ワーカーの `worker/tunnel.ts`（`createTunnels`。同じ踏み台と DB へのトンネルは使い回す）・初めての踏み台の印 `DB_SSH_UNKNOWN_HOST`（409）・鍵 `DbSshHostKey`（`sshHostKey.ts`）・画面の `SshHostKeyDialog` |
| SQL の履歴（接続ごと。AI が流したものに印） | `DbQueryHistoryEntry` / 表 `db_query_history`（v14。`ran_by` = `user` / `ai`、AI なら `chat_id`。接続ごとに新しい `DB_HISTORY_MAX`（500）件だけ残す）・店 `store.dbQueryHistory` |
| DB ワーカー（DB の接続・SQL の実行・結果の整形・SSH トンネル・準備のコマンドを動かす別のプロセス。初めて DB を使ったときに立ち上げ、何もしない状態が 5 分続いたら止める（準備のコマンドを流している間は止めない）） | `core/databases/worker/`（Electron ではコアのプロセスの頼み（RPC の `dbWorker.spawn`）でメインプロセスが `utilityProcess` で `out/main/dbWorker.js` を起動し、コアと MessagePort で直結する（製品版は Electron の fuses で RunAsNode をオフにするので `ELECTRON_RUN_AS_NODE` は使わない）、`npm run daemon`・テストでは `worker/main.ts` を tsx で fork。コアの側は登録の表とワーカーとのやり取り `DbWorkerClient` だけ） |
| Docker タブ（プロジェクトの画面の上のタブ「Docker」（「DB」の隣）。本体とワークツリーの compose のサービスを見て、起動・停止し、ログをタブの中のログの画面で見て、シェルを下のパネルのターミナルで開く。この Mac のアプリの中だけ。要件定義書の「5.14 Docker」。段階 1 と段階 2「DB で開く」を作った） | タブ `docker`（`#/projects/:id/docker`）・画面 `features/docker/`（状態と操作の hook `useDocker`・描く部品 `DockerPane`・ログの画面 `DockerLogs`）・コア `core/docker/`・API `GET /api/projects/:id/docker`（一覧）・`POST …/docker/actions`（操作）・`POST …/docker/watch`（見ています）・`GET …/docker/logs`（ログの流れ・さかのぼり）・`GET …/docker/db`（「DB で開く」の行き先）・SSE `docker_changed`（`project_id`）・共有の型 `@shared/types/docker.ts` |
| ワークツリーの実行環境（ワークツリーごとにポートの番号と Docker の組の名前を分け、本体と複数のワークツリーのアプリを同時に動かす。要件定義書の「5.16」）と帯（ワークツリーに渡す 100 個ずつの番号のまとまり。20100〜29900 の 99 本。+00 は開発サーバー、+01 から Docker の公開ポート）・対応表（本体の番号 → 帯の番号）・整えきれていない所（手順で分けきれなかった所）・分けられない理由 | `WorktreeEnv`・`WorktreePortSlot`（`@shared/types/worktreeEnv.ts`）・表 `worktree_envs`（v22）・コア `core/worktreeEnv/`（`WorktreeEnvService`）・`GitWorktree.env`・`issues`・`blocked`・ワークツリーの `.env` の Kickoff の区切りと `.kickoff/compose.worktree.yaml`・［AI で整える］のチャット（Git で管理していないファイルだけを書ける）= `Chat.untracked_only`（v23） |
| ポートを使っているプロセス（Kickoff のプロジェクトのフォルダで TCP のポートを待っているもの。要件定義書の「5.17」）・起動元（Kickoff の中 / 切り離されている / ほかのアプリ）・帯の添え書き | `PortProcess`・`PortOrigin`（`PORT_ORIGINS`）・`PortBandNote`（`@shared/types/ports.ts`）・コア `core/ports/`（`PortProcessService`・`PortWatch`）・SSE の `ports_changed` |
| compose（Docker タブの見出し。compose のファイルごとに 1 つ。プロジェクトフォルダからの場所と作業場所の札を出す）・サービス（compose に書いた 1 つ 1 つ。行）・コンテナ（サービスから作ったもの。「作っていない」サービスもある） | 見つけ方とファイルの選び方 `core/docker/compose.ts`（中身は `docker compose -f … --profile '*' config --format json` に聞く。YAML は読まない） |
| 組の名前（compose のプロジェクト名。`-p` / `name:` / `COMPOSE_PROJECT_NAME`。Kickoff のプロジェクトと混ざるので、画面でも文書でも「プロジェクト」と呼ばない） | ラベル `com.docker.compose.project`（作ってあるもの）・`config --format json` の `name`（作っていないもの） |
| 札付きのサービス（compose の `profiles:` の札が付いた、必要なときだけ使うサービス。薄く並べ、「すべて起動」に含めない）・使い捨てのコンテナ（`docker compose run` で作ったもの。サービスの行の下に畳む） | `profiles`・ラベル `com.docker.compose.oneoff=True` |
| 同じ組（2 つの作業場所、または同じ作業場所の 2 つの compose が同じ組の名前になること。コンテナとボリュームを共有し、片方の up でもう片方が作り直される） | 見出しの ⚠・起動の前の［起動する］［やめる］ |
| ログの画面（Docker タブの中、一覧の下に出す compose のログ。サービスの札で絞り込み、時刻の順に並べる。区切りの行 = 見ている間にコンテナが止まった・起動し直したことを示す行。エラー・警告の印は行の文字の決まりで付ける目安） | 画面 `features/docker/DockerLogs`・コア `core/docker/logs.ts`（コンテナごとの `docker logs --timestamps`）・エラーと警告の見分け `@shared/docker/logLevel.ts` |
| ポートの取り合い（Docker 同士。up が失敗してから相手を出す）・静かなぶつかり（Docker の外のプロセスが同じ番号で待っている。起動は成功し、127.0.0.1 への接続は外のプロセスが受ける） | `core/docker/portConflict.ts`（`lsof -nP +c 0`・エンジンの名前の一覧・`brew services info --all --json`） |
| AI の Docker の守り（別の作業場所のコンテナを止める・消す・作り直す、ボリュームを消す、まとめて止める・消す AI の Bash を、Auto mode でも承認カードで聞く） | `core/chat/guard/dockerGuard.ts`（待てる PreToolUse。承認は `requestApproval`・`canRemember: false`） |
| AI の書き込み先の守り（AI がファイルのツールで書ける場所 = 作業場所・メモのフォルダ・決まりの例外。同じリポジトリのほかの作業場所は断り、それ以外の外は Auto mode でも承認カードで聞く）・このチャットでは許可（承認カードの「覚える」ボタンの範囲。許したファイルはそのチャットの間もう聞かない） | `core/chat/guard/writeScope.ts`（`judgeFileWrite`・`WriteScopeParams`。待てる PreToolUse `writeScopeHook`）・`RememberScope`（`rule` = 常に許可 / `chat` = このチャットでは許可。`REMEMBER_SCOPE_LABELS`。承認の `remember_scope`）・`ChatRuntime.writeAllowed` |
| AI の Bash の砂場（AI の Bash が書ける場所を、作業場所・メモのフォルダ・決まりの例外だけにする。止めるのは OS）・砂場の外で流すコマンド（砂場の中では動かないもの = Electron の起動・brew install など）・通信の中継（Bash の通信をどこへでも通す。ネットワークは絞らない） | `core/chat/sandbox/bashSandbox.ts`（`bashSandboxFor`・`BashSandbox` の `writableDirs` / `readOnlyDirs` / `unsandboxedCommands` / `proxyPort`。`ProviderTurnParams.bashSandbox`。OS ごとの決まりは `HostPlatform.agentSandbox`）・`core/chat/sandbox/networkRelay.ts`（`startNetworkRelay`）・Claude Code の設定に直すのは `providers/claude/sandbox.ts` の `claudeSandbox` |
| 本体（スマホから見た、Kickoff のコアが動いている PC。いまは Mac）・本体の ID（本体を見分ける ID。スマホが複数の本体を切り替える目印。DB を作ったときに決め、DB を写して開発版を作ったら作り直す）・端末（この Mac の Kickoff を外から使うスマホなど。1 台ずつつなぎ、1 台ずつ取り消す）・端末ができること（使える / 見るだけ。見るだけの端末はチャットを読めるが、送る・答える・止めるはできない） | `DeviceAccess`（`full` / `read`。`DEVICE_ACCESS_LABELS`。表 `devices` の `access`（v25）。断る印 `DEVICE_READ_ONLY`）・`Store.databaseId`（`meta` の `database_id`。`/api/status` の `database_id`）・`Device`（`@shared/types/device.ts`）・表 `devices`（v24。トークンは hash だけ・プッシュの宛先 `push` は外に出さない）・店 `store.devices`・`core/system/devData.ts` の `becomeAnotherHost` |
| スマホのアプリ（Android。本体に Tailscale 経由でつなぎ、チャットを見る・送る・答える。ターミナルも） | `mobile/`（Expo。`mobile/CLAUDE.md`）・本体とのやり取りは `HostClient`・SSE は `readSse`・本体の一覧 `HostRegistry` |
| スマホ連携のオン・オフ（スマホからつなぐか。オンのときだけ端末の登録を受け付け、端末からの頼みを受け、電源につないでいる間は本体を眠らせない。待ち受けは 127.0.0.1 のまま） | 設定の `remote_enabled`（前は「LAN に公開」の意味だったが効いていなかった。2026-11-14 に決め直した）・断る印 `MOBILE_OFF` |
| 呼び主（API を呼んだのが、この Mac の画面か、つないだ端末か。どのトークンで来たかだけで決める）・端末に開く口（端末から使える API。既定は閉じていて、書いたものだけ開く） | `Caller`（`core/http/caller.ts`。`host` / `device`）・`DEVICE_ROUTES` / `deviceMayUse` / `deviceMaySee`（`core/http/deviceAccess.ts`）・403 の印 `DEVICE_FORBIDDEN` |
| ペアリング（端末をつなぐこと。Mac の画面が使い捨ての番号と QR を出し、端末が番号で頼み、Mac の画面で「この端末をつなぎますか」と確かめてから端末のトークンを 1 回だけ渡す）・つなぐ先の URL（端末から Mac の Kickoff に届く URL。QR に入れる） | `PairingCenter`（`core/devices/pairing.ts`）・`PairingState` / `PairingRequest` / `PairingClaimBody` / `PairingPollResult`（`@shared/types/device.ts`）・`pairingLink`（`@shared/devices/pairing.ts`）・設定の `mobile_url`・画面の `features/settings/MobileSettings.tsx` |
| 通知の判断（チャットの完了・失敗・回答待ち・CI の失敗を、それを見ていない人（この Mac の画面・端末）にだけ知らせる）・見ているもの（前に出しているチャット・CI のタブ。呼び主ごと） | `core/notifications/`（`NotificationCenter` / `Notice` / `PushSender` / `ViewingRegistry`）・`PUT /api/viewing`（`ViewingBody`）・`startCore({ notify, push })` |
| API の版（Mac の Kickoff とスマホのアプリのやり取りの形の番号。Kickoff の版とは別に持ち、形を壊す変更をしたときだけ 1 つ上げる。1.0 からは変更を「足すだけ」（項目を消さない・名前を変えない）にし、壊すなら版を上げる。0.x の間は壊してよい）・話が通じない（アプリが古すぎる / Mac の Kickoff が古すぎる） | `@shared/api/version.ts`（`API_VERSION` / `MIN_CLIENT_API_VERSION` / 見出し `x-kickoff-api` / `client_too_old`・`host_too_old` / `apiMismatch`）・SSE の最初の行 `ServerHello`・`ServerStatus.api_version` |
| 外の画像（返答の Markdown の http・https の画像。押すまで外へ通信せず「{ホスト} から画像を n 件表示」のボタンにする）・画像の表示の許可（そのボタンを押したホスト。チャットごと）・外部リンク（返答などの http・https のリンク。開く前に毎回確かめる）・確認せずに開くドメイン（確認の画面の「今後確認しない」で覚えたもの。アプリ全体） | `@shared/links/remoteImages`（`RemoteImage`・`remoteImageOf`）・`ChatImageHost`・表 `chat_image_hosts` / `chat_image_cache`・`core/remoteImages/`（`RemoteImageService`）・`features/chat/images/`・`@shared/links/linkWarnings`（`LINK_WARNINGS`）・設定の `link_open_in` / `trusted_link_domains`・`features/browser/linkOpen.ts` |

### チャットの軸とエージェントの軸

「親・子」と「メイン・サブ」は別の軸なので、画面の言葉で混ぜない。

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

## 3. ディレクトリ構成

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
  core/                Electron に依存しないサーバー（HTTP API・SQLite・エージェントの実行）。Mac のアプリではメインが起動する別のプロセス（utilityProcess）で動く
    index.ts           組み立てと終了（startCore）
    daemon.ts          Electron なしで起動
    host/              Mac のアプリのコアのプロセスの入口（main.ts → out/main/core.js）・メインとの RPC（protocol・rpc・ports）・メインにしかない口の写し（remote: ブラウザ・キーチェーン・通知・DB ワーカー）
    bus.ts             変更の知らせ（SSE へ）
    db/                schema・open（開く・版）・store（表ごとの店をまとめるだけ）・chats・events（記録と全文検索）・projects・groups・queues・snippets（定型文）・settings（設定・秘密・meta）
    http/              server（組み立て・認証・失敗の変換・SSE・画面の配信）・httpServer・auth・errors（NotFound など）・routes/（領域ごとに xxxRoutes）
    chat/              チャットの実行: runner（受付）・turn（1 回の実行）・input・runtime（チャットごとの作業中の状態）・queue（送信待ち）・recovery/（通信の切断・使用枠の上限からの再開）・approvals・fork・rewind・policy（AI への指示と許可）・guard/（書き込みの守り: 参照資料・Kickoff 自身）・transcript・uploads・autoArchive
    providers/         プロバイダーの抽象（types）と実装（claude/）
    git/               Git（exec・status・files・changes・history・worktrees）・GitHub（gh の状態・PR の見張り・アカウントと連携先）・取り込みの点検・ワークツリーの準備
    github/            GitHub タブの読み取り（gh api の GraphQL と REST・応答を形にする normalize・一覧の ETag の覚え）
    usage/             使用状況（Claude のプランの枠と、ほかのサービス services/）
    voice/             音声入力の文字起こし（whisper-cli・macOS の音声認識・OpenAI）と、音声モードの読み上げ（OpenAI の声）
    terminal/          内蔵ターミナルのシェル（TerminalSessions。この Mac の画面もスマホも WebSocket でつなぐ）と、AI に出力を読ませる口（TerminalControl）
    docker/            Docker タブ（一覧・操作・エンジンの状態・見ている間だけの docker events・compose のファイル・ポートの取り合い・ログ・AI の守りが見る様子・「DB で開く」の案。表は持たない）
    memos/             プロジェクトのメモ（プロジェクトの外のフォルダの Markdown・HTML の一覧・読み書き・移動・ゴミ箱・チャットの文から作る・HTML のメモが読むファイルを返す）
    trash/             Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻す・本当に消す。AI の kickoff-trash・チャットとプロジェクトのゴミ箱・アーカイブ済みのチャットの整理・会話記録の片付けと乗り換えの古い記録・ほかの Kickoff が使う会話記録の確かめ）
    notifications/     通知の判断（だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）・見ているもの・通知の中身
    platform/          OS ごとに違う処理の口（HostPlatform: アプリを開く・待っているソケット・プロセスの表・ログインシェルの PATH・音声認識など）と macOS の中身（macos/）。コアのプロセス・daemon が作って startCore に渡す（メインも childApps などで使う）
    system/            外部コマンド・パス・期限付きキャッシュ・保存先と名前（appEnv）・開発版のデータの写し
    testing/           テストの補助（サーバーの準備・偽のプロバイダー・一時フォルダ・Git の作業場所）
  main/                Electron のメインプロセス（窓・OS の口・仲立ちだけ。コアは別のプロセス）
    index.ts           起動の順番だけ
    app/               コアのプロセスの見張り役（起動・RPC・落ちたら作り直す・応答の見張り・DB ワーカーを作る）・ウィンドウ・メニュー・終了の片付け・子の Electron・権限の問い合わせ・起動の記録
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
mobile/                スマホのアプリ（Android。Expo。別の npm のまとまり。@shared は ../src/shared を読む）: src/app/（画面）・src/lib/（純粋な関数: SSE・API・ペアリング・本体の一覧・チャットの行）・src/state/（本体ごとのつながり・プッシュ）・src/chat/・src/terminal/
```

依存の向きは `features → stores / api / ui / hooks / lib → shared`、`app → features`。`ui` / `hooks` / `lib` は `features` を import しない。`core` と `renderer` は互いに import せず、共有するものは `shared` に置く。

## 4. 共通化の対象

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

## 決めたこと（測った数）

作らなかった形・選んだ形の根拠になった数。

- 会話の流れの読んでいた位置（`useTimelineWindow`）: ブラウザのスクロールアンカーに任せ、いちばん上（scrollTop 0）で前に項目が増えたときだけ JS で直す。アンカーを切って JS だけで保つ形と比べ、上へ読み進めたときのずれが最大 0.7px 対 3,300px だった（JS で位置を書き換えると慣性のスクロールも止まる）。
- macOS の音声認識が使えるかの確かめ（`kickoff-speech` の check）: ふつう 0.1 秒ほどで終わるので、結果を覚える仕組みは作らず、毎回聞く。
- 記録が届いたときの作り直し（`chatSelectors.ts`）: 記録全体から作り直しても、確かめ用のチャット（末尾と索引で約 1,600 件）で 0.3ms（95% で 0.8ms）なので、届いた分だけ計算する形は作らない。
- 裏のタブの会話の欄を `Activity` の hidden で止める（`ChatPane.tsx`）: 裏に 6 つのチャットを開き、表で返答を書かせながら打つと、1 文字の遅れが中央値 22ms → 15ms（95% で 23ms）、裏のタブを表に戻すのが 77ms → 68ms になった。
- チャットの流れの窓（`useRowWindow`）: 数千ターンのチャットで要素が 10 万個を超え、画面が真っ黒になった。窓にすると、上へ 50 画面読み進めても要素は 200 個ほど（窓なしは 1,300 個、250 画面で 8,300 個）。
- サイドバー・ボードは窓にせず、開いた直後だけ段階に分けて描く（`useProgressivePage`）: ⌘F・キーでの移動・ドラッグが、すべての行が DOM にあることを前提にするため。1,000 チャットで最初に見えるまでが、サイドバー 144〜270ms → 29〜51ms・ボード 226〜378ms → 30〜113ms・全プロジェクト 約 450ms → 48〜68ms、いちばん長いタスクが 120〜350ms → 0〜85ms（JS の合計はほぼ同じ。`scripts/perf/lists.mjs`）。
- 一番下への付いていき（`lib/followScroll.ts`）: 伸びるたびに effect で `scrollTop = scrollHeight` を書くと、書いている最中の入力 1 文字に 50ms ほどかかった。大きさの知らせの中で、ずれたときだけ寄せる。
