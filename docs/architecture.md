# Kickoff の設計（2026-11 の作り直し）

> 2026-11-04 に、リリース前の作り直しとして決めた設計。語彙・名前の決まり・ディレクトリ構成・共通化の対象を書く（スキーマは `src/app/core/migrations.ts`）。
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
| スマホのアプリ | パッケージ名 `app.ade.kickoff` を変えない（別のアプリになる）。`EXPO_PROJECT_ID` を変えると端末のプッシュ用 ID が使えない。プロジェクトの ID と `google-services.json` は EAS の環境変数に置き、署名の鍵はリポジトリに入れない。ファイル・Git の変更はスマホに開かない |

## 1. 語彙

画面の言葉とコードの名前を 1 対 1 にする。

| 画面の言葉 | コード |
|---|---|
| チャット | `Chat` / 表 `chats` / `chat_id` |
| 1 回の実行（送ってから終わるまで） | `TurnRequest`（`executeTurn` / `TurnOutcome` / `TurnControl`） |
| Kickoff のコア（別のプロセス）とその様子（起動中・動いている・起動し直している・止まった・応答しない。画面の上の帯） | コアのプロセスの見張り役 `CoreProcess`（`src/foundation/desktop/app/coreProcess.ts`）・様子 `CoreState`（`CORE_STATES`）・やり取りの形 `core/host/protocol.ts`（`CoreInit` / `CoreReady` / `CoreMethods` / `HostMethods`） |
| チャットの記録 | `ChatEvent` / 表 `chat_events` |
| グループ | `ChatGroup` / 表 `chat_groups` |
| 定型文（チャット欄の中の上の帯から入れる・送る、よく使う指示。共通かプロジェクトだけ） | `Snippet` / 表 `snippets`（`project_id` が NULL = 共通）・`src/features/snippets/` |
| 音声入力（マイク。話した言葉を文字にして入力欄に入れる）・音声モード（波形。話し終わったら送るか入力欄に入れ、AI の返答を声で読み上げる会話） | `useDictation` / `useVoiceMode`・`VoiceSession`・読み上げ `Speaker`（`src/features/voice/ui/`）・コアの `VoiceService` |
| 圧縮前指示（会話を圧縮する前に AI に送る指示。ノートを残してもらうなど。設定の共通の指示 → プロジェクトの指示の順につなぐ。それぞれオン / オフを切り替えられ、オフなら文を残したまま送らない） | 設定・プロジェクトの `pre_compact_prompt` / `pre_compact_enabled`・`@shared/chat/prompts` の `compactPromptFor`・記録の `user.pre_compact`・`src/features/compact/core/preCompact.ts`・PreCompact フック `core/providers/claude/preCompact.ts` |
| 圧縮後指示（会話を圧縮したあと、圧縮の間に預かった指示より先に AI に送る指示。ノートを読み直してもらうなど。つなぎ方は圧縮前指示と同じ） | 設定・プロジェクトの `post_compact_prompt` / `post_compact_enabled`・`@shared/chat/prompts` の `postCompactMessage`・記録の `user.post_compact`・送信待ちの `QueuedMessage.post_compact`・`@shared/chat/prompts` の `compactPromptFor` |
| プロジェクトフォルダ（プロジェクトに登録したフォルダ。AI が作業する所。git のリポジトリの中のフォルダでもよい。「フォルダ」「プロジェクトのフォルダ」「本体のフォルダ」とは呼ばない。ワークツリーと並べるときだけ「本体」） | `Project.repo_path`（`PUT /api/projects/:id/repo-path`・`changeProjectFolder`。AI へはシステムプロンプトの「プロジェクトフォルダ」） |
| 作業フォルダ（そのチャットの AI が実際に作業する所。本体で作業するならプロジェクトフォルダ、ワークツリーならその中の同じ位置） | `workdirOf(chat, project)`（`chat.worktree_path ?? project.repo_path`） |
| ノートフォルダ（「ノート」タブのノートを置くフォルダ。プロジェクトフォルダとは別の場所で、プロジェクトフォルダを変えても変わらない） | `NoteService.dirOf(project)`（`note_dir` か、設定の `notes_dir` の下の `note_folder`） |
| 送信待ち（あとで送る）・預かり（いまのやり取りが終わったら、送信待ちより先に送る） | 出す箱 `Outbox`（`later` / `now`・`chat_outbox`）・`QueuedMessage`・操作 `@shared/chat/outbox`・命令 `QueueCommand`（`applyQueueCommand`） |
| 添付（チャットの指示に添えるもの。種類 = ファイル（📎・ドラッグ・貼り付け）/ ノート（付けたときの写し）/ 取ったもの（「AI に渡す」で押したときの中身をファイルにしたもの）。中身は送らず、パスと見出しを書き添えて AI が Read で読む） | `Attachment`（`kind`: `file` / `note` / `capture`）・取ったものの出どころ `AttachmentSource`（`type` は `ATTACHMENT_SOURCE_TYPES`）・`POST /api/captures`・`POST /api/projects/:id/note/snapshot`・`UploadStore`（`src/features/attachments/core/uploads.ts`）・見出し `src/features/attachments/core/attachmentNotes.ts`・鍵を伏せる `@shared/foundation/secrets/redact` |
| AI に渡す（各タブの 1 つのもの（issue・PR・CI の落ちたステップのログ・DB のつながらない様子・ブラウザのタブの画面とコンソール・ターミナルで選んだ長い文など）を、押した時点の中身の札にしてチャットの入力欄に一言と入れる。渡し先 = 新しいチャットで始める / このチャットに追加 / 新しい子チャットで聞く / ほかのチャットに追加。送るのは自分で） | 渡すもの `HandOffItem`・渡し先の拡張点 `handOffTargets`（`src/features/attachments/ui/handoff/handOffTargets.ts`。入力欄・子チャット・新しいチャットの機能が登録）・ボタン `HandOffButton`（「AI に渡す ▾」）・ブラウザの中身はメインプロセスの `agentBrowser.handOffCapture`（`@shared/foundation/ipc` の `BrowserHandOffCapture`）・画像の札は `POST /api/captures` の `image_base64` |
| 起動したときの再開の確かめ（前回の終了で、作業の途中で止まったチャットと、自動で送るまま残った送信待ちを、起動してから続けるか・送るか聞く。送る / 続ける・続けてから送る / 止めておく・止めたまま / あとで） | `RestartResume` / `RestartResumeAction`（確かめを待つ印は `ChatLive.restart_resume`（`RestartResumeState`）、DB の印は `chats.resume_pending`。`GET\|POST /api/restart-resumes`・`ChatRunner.restartResumes`・画面の `RestartResumeDialog` / `RestartResumeBanner`・店 `src/features/queue/ui/restartResume/restartResumes.ts`） |
| 作業の段階（作業していない・送る準備・作業中・圧縮の前後・作業の終わりにすることを待つ）・「いま」を預かる理由 | `ChatLive.phase`（`WorkPhase`・`isBusyPhase`）・`ChatLive.hold`（`HoldReason`） |
| チャットの実行の決まり（出来事を受けて、次の状態と殻が行う命令を決める） | 純粋な `step`（`src/features/chat/core/run/machine/`）・状態 `ChatRunState`・出来事 `RunEvent`・命令 `Effect` |
| チャットの実行の殻（出来事を 1 件ずつ決まりに通し、命令を行う。ほかの機能に出す口は `ChatRunPort`） | `ChatRunner`（`src/features/chat/core/run/`）・チャットごとの状態 `ChatRun` |
| チャットの画面の置き場所の値（タブ・右の欄・別ウィンドウ・ノートの違い）と、描いている画面の登録簿 | `ChatHost`・`ChatScreen`・`ChatEnvironment`・`chatScreens.ts`（`src/features/chat/ui/screen/`・`src/features/conversation/ui/screen/`） |
| 実行に足すもの（上の機能が 1 回の実行に足す環境変数・フォルダ・システムプロンプトの節・添える文脈・作業の終わりにすること。AI のツールは含めない） | `TurnContributor`（`chat.api.addTurnContributor`。足したもの `TurnParts`・集める `collectTurnParts`） |
| 送信待ちに挟む行（会話の圧縮・コンテキストの消去） | `QueueAction`（`compact` / `clear`。`QueuedMessage.compact` / `clear`・`@shared/chat/queueActions`） |
| コンテキストの消去（これまでの会話を AI に引き継がず、次から新しい会話で始める。記録は残す） | `ChatRunner.clearContext`・記録 `context_cleared`（巻き戻し・子チャットの引き継ぎはこの境目を越えない `src/features/chat/core/sessionPoints.ts`） |
| 作業場所を移した区切り（チャットの作業場所（本体 / ワークツリー・プロジェクト・フォルダ）が変わった所。会話は新しいセッションに写して続け、これより前の発言は巻き戻せず、分岐の起点にもできない） | 記録 `workplace_moved`（`from` / `to` は `WorkplaceRef`・理由 `WorkplaceMoveReason`）・移す処理 `src/features/workplaceMove/core/move.ts` の `moveChatWorkplace`（口は `workplaceMove.api.move`。画面から移すのは `src/features/workplaceMove/core/userMove.ts`・`POST /api/chats/:id/workplace`）・決まり `@shared/workplaceMove/workplaceMoves` |
| 作業中の様子（保存しない） | `ChatLive` |
| 末尾（チャットを開くときに読む最新のターン。ターンの境目は作業の終わり） | `tail`（`GET /api/chats/:id?tail_turns=`・`CHAT_TAIL_TURNS`・`src/features/chat/core/chatLogQuery.ts` の `tailStart`） |
| 索引（末尾より前の記録のうち、記録全体から作るもの（サブエージェントの一覧・ToDo・図・指示の履歴など）が要るものだけを軽くしたもの） | `index`（`ChatDetail.index`・`@shared/chat/chatIndex` の `selectIndexIds` / `ChatEventMeta`・覆う索引 `idx_chat_events_meta`） |
| 途中の一部分（遠い発言へ移るときに読む、末尾とつながっていない記録のまとまり） | `focus`（`GET /api/chats/:id/events?around=`・`ChatEventPage`） |
| チャットの店（開いているチャットの中身を、部品の外にチャットごとに 1 つ持つ画面の店。同じチャットを何か所で開いても読み込みと SSE は 1 回）と口（部品が購読する用途ごとの入口: 詳細・記録・途中の文・サブエージェントの途中経過） | `src/features/chat/ui/store/`（`createChatStore`・口 `detail` / `log` / `streaming` / `progress`・hook `useChatDetail` / `useStreaming` と取り出し口 `defineChatSelector`） |
| 書きかけの返答（作業中に、確定する前の AI の文。画面では「書いている途中の返答」）と、その世代（消すたびに進む。確定した返答と同じ描き直しで入れ替える） | コアの `StreamingTexts`（`Bus.streamingText`・詳細の `streaming_text` / `streaming_length`・`chat_delta` の `offset`）・画面の店の `streamGen` / `streamText` |
| フィード（全プロジェクトの画面の、チャットごとのメインエージェントの最新の返答 1 件を新しい順に並べたもの） | `FeedItem`（`GET /api/feed`・`store.events.feed`・画面の `FeedList` / `useFeed`） |
| チャットの選択（モデル・深さ・権限・ファスト） | `ChatOptions`（`model` / `effort` / `permission_mode` / `fast_mode`） |
| 権限モード | `PermissionMode` |
| AI（チャットを動かす CLI。チャットごとに決め、途中では変えない） | `ProviderId`（`PROVIDER_IDS`・名前 `PROVIDER_LABELS`）・`AgentProvider`・チャットの `provider` |
| AI によってできること・できないこと（できないものは理由付きで押せない） | `ProviderCapability`（AI ごとの表 `PROVIDERS`・`ProviderStatus.capabilities`。押せない理由の文は `providerFeatureMissing`） |
| Kickoff の守りをツールの形によらず当てる（承認の頼みで聞いてくる CLI 向け） | 守りの門 `ToolGate`（`guard`・`deny`・`guardWrites`・`guardRead`・`byMode`。`src/features/guard/core/gate.ts` の `createToolGate`。判定は `judge.ts` の `judgeCall` と `rules.ts` の `GuardRule`・`GuardVerdict`）・権限モードの答え `modeVerdict`（`src/features/ai/core/permissionMode.ts`。`GateOutcome`） |
| Codex の会話と 1 回の実行 | スレッド（= セッション ID）・ターン（= 分岐の起点）・`CodexProvider`（`core/providers/codex/`。`codex app-server`） |
| GitHub Copilot の会話と 1 回の実行 | セッション（= セッション ID）・最後の記録のイベント（= 分岐の起点）・`CopilotProvider`（`core/providers/copilot/`。`@github/copilot-sdk`） |
| ACP のエージェント（Cursor・Gemini）の会話と 1 回の実行 | ACP のセッション（= セッション ID）・指示（`session/prompt`）・CLI ごとの違い `AcpProviderSpec`（`CURSOR_SPEC`・`GEMINI_SPEC`）・`AcpProvider`（`core/providers/acp/`）・標準入出力の JSON-RPC の口 `StdioRpc`（`core/providers/stdioRpc.ts`。Codex と共有） |
| AI のログインの仕方（サブスク / API キー）と API キーの置き場 | 設定の `provider_auth`（`ProviderAuthMode`）・`ProviderKeyVault`（`core/providers/keys.ts`）・`ProviderTurnParams.auth`・画面の `ProviderAuthSettings` |
| 画面でのチャットの AI（選ぶ札・見せる札・その AI にない機能の理由・前に出しているチャットの AI） | `src/features/ai/ui/provider/`（`ProviderPicker`・`ChatProviderContext` / `useFeatureBlock`・`noteForegroundProvider` / `useForegroundProvider`）・途中で替える札 `ProviderSwitchChip`（`src/features/providerSwitch/ui/`。替えられる AI は `SWITCHABLE_PROVIDERS`） |
| アプリの設定（設定のダイアログの項目。機能ごとに宣言する） | 表 `setting`・`SettingTable`（`@shared/foundation/contract/settings`。機能の `src/shared/<機能>/settings.ts`）・束ね `ALL_SETTINGS` と形 `AppSettings`（`src/app/shared/settings.ts`）・PUT の zod `defineSettingSchemas`（機能の `core/settings.ts`。束ね `SETTING_SCHEMAS`） |
| AI の操作ツール（埋め込みブラウザ・DB・チャットのツールを、どの AI の CLI にも同じに出す。1 回の実行ごとの鍵で、その実行に決めたツールだけ） | コアの MCP サーバー `McpToolHost`（`src/foundation/core/aiTools/host.ts`。口 `/mcp/<名前>`）・ツール `defineAiTool`・組 `AiToolGroup`・作業の文脈 `AiTurn`・組をサーバー `ToolServer` にする `AiToolRegistry`・CLI に渡す口 `ToolEndpoint`（`ProviderTurnParams.tools`） |
| AI のブラウザ操作（チャットの AI が Kickoff の埋め込みブラウザのタブを見る・操作する。操作中のタブには「AI 操作中」の印） | 口 `BrowserControl`（`src/features/browser/core/`）・ツール `kickoff_browser`（`browserToolGroup`。コアの MCP サーバー `src/foundation/core/aiTools/`）・実装 `agentBrowser`（`src/features/browser/desktop/`）・IPC `agentBrowser`・印 `useAgentBrowsing` |
| AI が作るチャット（チャットの AI が、頼まれて子チャット・兄弟チャット・親のないチャットを（新しいワークツリーでも）作って依頼を送る。毎回聞く / 聞かずに作る / 作らせない。AI が作った世代は 2 世代目まで） | ツール `kickoff_chat`（`create_chat`。`chatToolGroups`（コアの MCP サーバー `src/foundation/core/aiTools/`）・名前は `@shared/chat/aiCreateChat` の `AI_CREATE_CHAT_TOOL`・作る場所 `AiChatRelation`（`child` / `sibling` / `root`。`AI_CHAT_RELATION_LABELS`））・中身 `AiCreateChatTools`（`src/features/childChats/core/aiCreateChat.ts`）・設定 `ai_create_chat`（`AiCreateChatMode`: `ask` / `allow` / `off`）・世代 `chats.ai_generation`（店の中だけ `store.chats.aiGeneration`） |
| 家系（いちばん上の親チャットから下にぶら下がるチャットの全部。チャットの AI が固定・グループを聞かずに変えられる範囲。名前は家系の外でも同じプロジェクトなら変えられる） | ツール `kickoff_chat` の `list_family_chats` / `update_chat`（名前は `@shared/chat/aiChatEdit` の `AI_LIST_FAMILY_TOOL` / `AI_UPDATE_CHAT_TOOL`・引数 `UpdateChatInput`）・中身 `AiChatEditTools`（`src/features/chat/core/tools/aiChatEdit.ts`）・関係の呼び名 `familyRelation`（`src/shared/chat/family.ts`） |
| AI が開く（チャットの AI がノート・家系のチャット・ファイル・差分を利用者の画面に開き、SQL を SQL のタブに入れる。右の欄 / 別ウィンドウ / 設定どおり） | ツール `kickoff_chat` の `open_note` / `open_chat` / `open_file` / `open_diff` / `open_sql`（定義と中身は持ち主の機能の `core/tools.ts`。chat の分は `chatOpenTools.ts`。名前は `@shared/chat/aiOpen` の `AI_OPEN_NOTE_TOOL` など）・SSE の `open_view`（`OpenViewRequest`・場所 `OpenPlace`: `side` / `window`）・画面の受け口 `useAiOpenRequests`（`src/features/chat/ui/open/aiOpenRequests.ts`） |
| AI の下書き（チャットの AI が家系のチャットの入力欄の後ろに文を足す。送るのは利用者） | ツール `kickoff_chat` の `add_draft`（`AI_ADD_DRAFT_TOOL`）・SSE の `chat_draft`（`ChatDraftRequest`。親チャットに入れるなら札 `from`）・画面の受け口は同じ `useAiOpenRequests` |
| AI が読む（チャットの AI が同じプロジェクトのチャットの一覧・会話と使用枠・このプロジェクトのターミナルの出力を読む） | ツール `kickoff_chat` の `list_project_chats` / `read_chat` / `get_usage`（`@shared/chat/aiRead`・定義と中身 `src/features/chat/core/tools/read.ts`・`get_usage` は `src/features/ai/core/tools.ts`・やり取りへの分け方 `conversationTurns`（`src/features/chat/core/conversation.ts`））と `list_terminals` / `read_terminal`（`chatTerminalTools.ts`・`@shared/terminal/aiTerminal`・中身 `AiTerminalTools`（`src/features/terminal/core/aiTerminal.ts`）・読み取りの口 `TerminalControl`（`src/features/terminal/core/control.ts`。中身はコアの `TerminalSessions`）） |
| AI が足す・変える（チャットの AI がこのプロジェクトの定型文に足す・ノートの名前を変える／移す） | ツール `kickoff_chat` の `add_snippet` / `move_note`（`@shared/chat/aiProject`）・定義と中身 `src/features/snippets/core/tools.ts`・`src/features/notes/core/tools.ts` |
| 図（チャットの AI が返答の中に描く SVG・HTML・Mermaid の図。文の間に閉じた枠で出し、その場で描き直せる。図の中のボタンから利用者が押したときだけ発言を送れる） | `Visual`（ツール `kickoff_chat` の `visual_guide` / `show_visual` / `update_visual`（`src/features/visuals/core/tools.ts`・`@shared/visuals/aiVisual`。種類 `VisualKind`・図の ID `visual_id`・記録から組み立てる `collectVisuals` → `ChatVisual`）・中身 `AiVisualTools`（`src/features/visuals/core/aiVisual.ts`）・枠のページ `/visual-frame`（`@shared/visuals/visualDocument`）・`ChatLive.drawing_visual`・画面 `src/features/visuals/ui/`） |
| 数式（返答・ノート・GitHub の Markdown の数式を KaTeX で描く。$$…$$・\(…\)・\[…\]・数式らしい $…$） | `@shared/foundation/markdown/mathGuard`（`looksLikeMath` / `isSingleDollarMath` / `mathRanges`）・画面 `src/foundation/ui/kit/markdown/math/`・ノート `src/features/notes/ui/liveRich.ts`（Mermaid の塊も図にする） |
| ゴミ箱（Kickoff の中のゴミ箱。消したもの（AI の rm の代わりの kickoff-trash・画面の「ゴミ箱に入れる」・チャット・プロジェクトの削除）を 3 日取っておき、元に戻せる。OS のゴミ箱とは別。メモの仕様書「ファイル削除」） | `TrashItem` / 表 `trash_items`（v26。種類 `TrashKind`: `file` / `chat` / `project` / `session` / `worktree`（消したワークツリーの控え。Git の参照 `refs/kickoff/trash/<id>/branch|changes`））・置き場はデータのフォルダの `trash/<id>/item/`・`TrashService`（`src/features/trash/core/`）・`GET /api/projects/:id/trash`・`POST /api/trash/:id/restore`・SSE `trash`・Kickoff が作ったセッションの覚え（表 `agent_sessions`。v28） |
| 未読 / 既読 | `unread` / `read` |
| タブの入れ物（右のパネル・チャット欄・下のパネル・右の欄） | `Panel`（`usePanel`） |
| 右サイドバー（画面の右端の欄。右端のアイコンの列で、ブラウザとプロジェクトのタブと同じ画面（ノート・ファイル・検索・変更・履歴・DB・Docker・GitHub・CI・ゴミ箱）を切り替える。コードでは「チャット欄」`side`。チャットのパネルはチャットだけ・下のパネルはターミナルだけ） | `surface: "side"`（`useProjectChat` ＋ `ProjectChat`） |
| 右サイドバーの中身（右端のアイコンの列で選ぶもの。プロジェクトごと） | `SideView`（`browser` か、プロジェクトのタブの名前。設定 `projects:side-view`・`src/features/projects/ui/rightSidebar/sideView.ts`）・右端の列 `SideRail`・中身 `SideBody` / `SideViewBody` |
| 右の欄（チャットの画面の右に、サブエージェントの画面を並べる欄。チャットのタブの中に入れ子にしたタブの入れ物） | 欄 `agents`（`SURFACES.agents`・`AgentSplit`）・タブの種類 `subagent`・画面 `SubagentScreen` |
| チャットタブ（チャットをボードと分けて横幅いっぱいに開くプロジェクトのタブ。設定でボードの右のパネルにも戻せる） | タブ `chats`（`#/projects/:id/chats`）・`ChatsTab`・置き方の設定 `CHAT_PLACEMENT`（`separate` / `together`）。中身はボードの右のパネルと同じ `kanban:<プロジェクト>` のパネル |
| ノート（プロジェクトの「ノート」タブ。プロジェクトの外のフォルダの Markdown か HTML（HTML のノート = HTML と CSS で書くページ。描いた見た目で見る）） | ノートのフォルダ（設定 `notes_dir` の下の、プロジェクトの `note_folder`。別の場所なら `note_dir`）・`NoteService`（`src/features/notes/core/`）・`NoteTab`（`src/features/notes/ui/`） |
| ノートのチャット（ノートの右の欄で話す、ノートごとに 1 つのふつうのチャット。一覧には並べず、そのノートの右の欄から開く。AI はノートのファイルを直接読み書きする） | `Chat` の `note_path`・`POST /api/projects/:id/note/chat`・`NoteChat`（`src/features/notes/ui/`） |
| 子チャット（チャットの発言から「新しい子チャットで聞く」・右の欄の「＋」の「新しい子チャット」で始める横道の質問。親の中にだけ置き、いちばん上の親の右の欄か別ウィンドウで開く（設定 `CHILD_CHAT_OPEN_IN`。作ったときは chat の保存の `childOpenOnCreate` で、開かないも選べる）。孫・ひ孫も作れる。サブエージェントの「伝える」で「新しい子チャットで聞く」を選ぶと、そのサブエージェントの会話の記録を添えた子チャットになる） | `Chat` の `parent_chat_id`（親）・`parent_event_id`（聞いた発言）・`startChildChat`（`src/features/childChats/core/children.ts`）・`startSubagentChildChat`（`src/features/childChats/core/subagentChild.ts`）・`src/features/childChats/ui/` |
| 親から外す（子チャットを親のないチャットにする・孫より深いものを自分の先祖の子に上げる。付け替えはしない。子孫はついていく） | `POST /api/chats/:id/detach`（本文 `ChatDetachBody`）・`detachChat`（`src/features/childChats/core/detach.ts`）・`store.chats.detach`・AI の `update_chat` の `parent_id` |
| 親への依頼文（子チャットの AI に、親チャットの AI へ渡す依頼文だけを書いてもらう頼み。発言の印 = 依頼文の頼み）・親チャットに追加（子チャットの作業の最後の返答を、そのまま直接の親に渡す。渡し方 = 入力欄 / 今すぐ送る / 送信待ち、渡したあと = そのまま / アーカイブ / 削除）・渡したことの印 / 出どころの札 | 頼み方の文 `handoffRequestPrompt`・最後の返答 `lastReplyOfTurn`（`@shared/chat/handoff`）・発言の印 `MessageMarks`（`handoff_request` / `handoff_from`）・渡し方 `HandoffVia`・渡したあと `HandoffAfter`・`POST /api/chats/:id/handoff`（`src/features/childChats/core/handBack.ts`）・記録 `handoff`・`src/features/childChats/ui/handBack.ts` |
| 見え方（チャットの流れの、記録ではない状態。開いているツール・カード・思考などの開閉、測った行の高さ、読んでいた位置。チャットの画面を作り直しても残し、最近の 50 チャットまでメモリだけに持つ。記録の店とは分ける） | `TimelineView`（`src/features/chat/ui/timeline/timelineView.ts` の `createTimelineViews` / `timelineView` / `useTimelineOpen`） |
| 会話 / 動き（チャットの画面の見え方。動き = メインエージェントとすべてのサブエージェントの動きを 1 本の時系列に） | `ChatShowing`（`conversation` / `activity`）・`ActivityRow`（`src/features/conversation/ui/activity/`） |
| GitHub タブ（プロジェクトの画面の上のタブで、連携先のリポジトリの issue・PR を「issue｜PR」で切り替えて見る・書く・AI に渡す。チャットの右の欄にも開ける。要件定義書の「5.11 GitHub」。段階 1「読む」・段階 2「AI に渡す」・段階 3「書く」まで作った。PR のチェックの「ログを開く」は CI のタブへ） | タブ `github`（`#/projects/:id/github`）・右の欄のタブの種類 `github`・画面 `src/features/github/ui/`・コア `src/features/github/core/`（gh api の GraphQL・REST。gh を動かすのは `gh.ts` だけ。ブランチの PR は `pulls.ts`）・HTTP `/api/projects/:id/github/…` |
| 連携先（PR・issue を見る GitHub のリポジトリ。プロジェクトフォルダの git の remote から自動で決める。`gh repo set-default` → `upstream` → `origin`）と、プロジェクトで使う GitHub のアカウント（gh に入っているものから選ぶ。gh の有効なアカウントは切り替えない） | `GitHubRemote`・`GitHubTarget`（`src/features/github/core/target.ts`）・選んだ remote はプロジェクトの `github_remote`・アカウントは `github_account`（`GitHubAccount`・`src/features/github/core/account.ts` の `runAsGitHubAccount`）・ワークツリーの PR を見張るかは `pr_watch`・設定の画面は `ProjectGitHub` |
| 利用者が見ているもの（AI が読む、この Mac の画面のウィンドウの見えているペインごとの前のタブ・右の欄・選んでいる範囲と、発言を送った時点の様子。スマホは入れない） | `UserView` / `UserViewPane` / `UserViewTab`（`src/shared/userView/types.ts`）・`PUT /api/user-view`・送る本文の `user_view`・`UserViewRegistry`（`src/features/userView/core/`）・ツール `get_user_view`（`AI_GET_USER_VIEW_TOOL`）・画面 `src/features/userView/ui/userViewCollect.ts`・`src/features/userView/ui/userViewReport.ts` |
| AI からの知らせ（AI が長い作業の途中で区切り・あとで見てほしい判断を利用者に届ける。この Mac の通知は本文、スマホのプッシュは本文なし） | ツール `notify_user`（表示の表は `@shared/notifications/tools` の `NOTIFY_USER_VIEW`）・定義と中身 `src/features/notifications/core/tools.ts`（`notifyToolGroup`）・SSE（バス）の `ai_notice`・通知の種類 `NoticeKind` の `ai_notice`（`aiNotice`） |
| 作業場所を移す予約（AI が自分のチャットの作業場所を移すよう頼む。作業が最後まで終わったら Kickoff が移し、続きの指示を送る。作業中の様子に出て取り消せる） | ツール `move_workplace` / `cancel_workplace_move`（`@shared/workplaceMove/aiWorkplace` の `AI_MOVE_WORKPLACE_TOOL` / `AI_CANCEL_WORKPLACE_MOVE_TOOL`）・中身 `src/features/workplaceMove/core/aiWorkplace.ts`・予約 `reserveMove`（`src/features/workplaceMove/core/reserve.ts`）・作業中の様子 `ChatLive.workplace_move`（`WorkplaceMoveReservation`）・取り消し `DELETE /api/chats/:id/workplace-move`・続きの発言の印 `workplace_continuation` |
| 作業の終わりの予約（片付け・作業場所の移動・アーカイブ・削除を、その作業が終わってから order の順に行う。入れ物は 1 つ） | `reserveAtTurnEnd`・`TurnEndTask`（`src/features/chat/core/turnEnd.ts`） |
| AI のアーカイブ・削除（AI が同じプロジェクトのチャットを子孫ごとアーカイブする・Kickoff のゴミ箱に入れる。頼まれたときだけ。自分・自分の祖先は作業の終わりに行う予約） | ツール `archive_chat` / `delete_chat`（`@shared/chat/aiChatRemove` の `AI_ARCHIVE_CHAT_TOOL` / `AI_DELETE_CHAT_TOOL`）・中身 `ChatRemover`（`src/features/chat/core/tools/aiChatRemove.ts`） |
| ワークツリーの後始末（ワークツリーを消す。画面の「消す」と AI の finish_worktree。消す前の確かめ・失うものの控え（3 日）・ワークツリー自身のチャットからの予約）・取り込み済み（ローカルで本体のブランチに入っている / GitHub で PR がマージ済み）・控え（消す前に失うものを入れておく Git の参照） | 消す `WorktreeRemover`（`src/features/worktrees/core/remove.ts`）・AI の `AiWorktreeFinish`（`aiFinish.ts`）・控え `src/features/worktrees/core/backup.ts`・結果の文 `src/features/worktrees/core/report.ts`（`MergeState`）・ツール `finish_worktree`（`@shared/worktrees/aiWorktree` の `AI_FINISH_WORKTREE_TOOL`） |
| ワークツリーの PR の知らせ（ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられたこと。印と 1 つの確認で片付けを聞く） | `WorktreePrNotice`・見張り `WorktreePrWatch`（`src/features/github/core/prWatch.ts`）・閉じた確認の表 `worktree_pr_dismissals`・画面 `src/features/github/ui/prNotice/` |
| CI のタブ（プロジェクトの画面の上のタブ「CI」（「GitHub」の隣）。GitHub Actions の実行の一覧・ジョブとステップのログ・AI に渡す・やり直す。外の CI は成否とリンクだけ。この Mac のアプリの中だけ。要件定義書の「5.15 CI の結果」） | タブ `ci`（`#/projects/:id/ci`）・画面 `src/features/github/ui/ci/`・コア `src/features/github/core/ci.ts` の `CiService`（読み方は純粋な `ciNormalize.ts`）・HTTP `/api/projects/:id/ci/runs/…`（端末には開かない）・共有の型 `src/shared/github/ciTypes.ts`（実行 `CiRun`・ジョブ `CiJob`・ステップ `CiStep`・状態 `CiState` / `CI_STATES`・外の CI `CiExternalCheck`） |
| CI の失敗の知らせ（作業場所のブランチと既定のブランチで落ちた実行を Mac の通知で。同じ実行は 1 回だけ） | プロジェクトの `ci_watch`（v21）・知らせた実行 `github_ci_notices`（店 `store.ciNotices`）・PR の見張りの `alsoCheck` で `CiService.watch`・SSE `ci_failed`（`CiFailure`）・出すかの判断はコアの `src/features/notifications/core/center.ts`・通知の ID `kickoff-ci:`（`notifications.onOpenCi`） |
| issue・PR の結び付き（どの issue・PR のためのチャットか。カード・見出しに `#番号`。GitHub タブの「AI に渡す」で付く） | `Chat` の `github_repo` / `github_number` / `github_kind`（v19。種類は PR を作るときに「Closes #番号」を足すのを issue だけにするため） |
| DB クライアント（プロジェクトの画面の上のタブ「DB」・チャットの右の欄の ▾ の「DB ▸」・別ウィンドウで開く。接続の一覧・テーブル・SQL・ER 図。要件定義書の「5.12 DB クライアント」） | タブ `db`（`#/projects/:id/db`）・画面 `src/features/database/ui/`・コア `src/features/database/core/`・HTTP `/api/projects/:id/db-connections/…`（接続元が 127.0.0.1 の頼みだけ受ける） |
| DB 接続（プロジェクトごとに登録する接続。ほかのプロジェクトから写せる） | `DbConnection` / 表 `db_connections`（v13）。パスワードは `secrets` の `db_connection:<id>:password`、AI 用のユーザーのパスワードは `:ai_password`（v14。段階 2 で `:ssh_password`）。値はメインプロセスが渡す `safeStorage` で暗号化したもの（暗号化した印を付ける。`safeStorage` のない単体のコア・テストだけ暗号化せずに置く）。キーチェーンで拒否されて開けないときに利用者が入れたパスワードは、コアのメモリにだけ持つ。接続を消すと、表のトリガー `db_connections_drop_secrets` がその接続の秘密の値も消す（プロジェクトを消したときの連鎖の削除でも効く） |
| DB の種類 | `DbEngine`（`sqlite` / `postgres` / `mysql`。MariaDB は `mysql`） |
| 環境（DB 接続の環境。色・読み取り専用・書き込みの前の確かめ・AI の既定をまとめて決める） | `DbEnvironment`（`local` / `dev` / `staging` / `production`） |
| 書き込む前の確かめ（DB 接続ごと。危険な文だけ / 書き込みのたび / 環境の名前を打つ） | `DbWriteCheck`（`dangerous` / `all` / `env_name`。既定は環境から: ローカル・開発 = `dangerous`、ステージング = `all`、本番 = `env_name`）・接続の `write_check`（v20）。危険な文の判定は `@shared/database/sqlStatements.ts` の `dangerReason` / `writeConfirmation` |
| AI に見せるか（DB 接続ごと。見せない / 承認して見せる / 自由に見せる） | `DbAiAccess`（`none` / `ask` / `allow`。既定は環境から: ローカル・開発 = `allow`、ステージング = `ask`、本番 = `none`）・AI のツール `kickoff_db`（`db_connections` / `db_objects` / `db_describe` / `db_query`。中身は `src/features/database/core/aiTools.ts` の `DbAiTools`、MCP は `src/features/database/core/tools.ts`（コアの MCP サーバー）。すべて聞かずに使わせるもの（`autoAllow`）に入れ、ツールの中で `ai_access` を見て、見せない接続は名前でも断り、承認して見せる接続の `db_query` は承認カードで聞く（権限モードによらず効く））・AI 用のユーザー `ai_username`（v14。あれば AI の SQL だけこのユーザーでつなぐ）・見せない接続の守り（AI がそのホスト・URL・SQLite のファイルを使う Bash と、ファイルのツールで SQLite のファイルを開くのを PreToolUse で断る。`src/features/database/core/guard/hiddenDb.ts`） |
| ER 図（DB クライアントのタブ。接続と場所（DB・スキーマ）ごとに 1 つ） | タブ `DbErTab`（`src/features/database/ui/dbClientTabs.ts`。まわりを見る中心 `focus`・段の数 `depth`・描くテーブル `names`）・中身 `DbErSchema` / `DbErTable`（`POST …/db-connections/:cid/er`）・関係 `ErRelation`（外部キーと、制約のない関係の推測 `inferred`。多さ `ErCardinality`）・動かした位置 `DbErPositions` / 表 `db_er_layouts`（列 `scope`）・店 `store.dbErLayouts` |
| テーブルの絞り込み（テーブルのタブのデータの上の帯。条件か WHERE の式）・行の詳細・書き出し | 絞り込み `DbRowFilter`（条件 `DbFilter`・比べ方 `DbFilterOp` / `DB_FILTER_OPS`・WHERE の式 `where`。タブの `DbTableTab.filter`。SQL は `@shared/database/dbFilter.ts` の `filterSql`）・行の詳細 `TableRowDetail`・書き出しの形 `DbExportFormat`（CSV / TSV / JSON） |
| プロジェクトからの取り込み（DB クライアントの接続の一覧の「プロジェクトから取り込む」） | 見つけた案 `DbImportCandidate`（見つけた所 `DbImportSource` / `DB_IMPORT_SOURCES`: env・compose・prisma・file）・取り込む本文 `DbImportBody`・コア `src/features/database/core/import/`（`scanProjectDbs`）・`GET|POST …/db-connections/import` |
| 接続の手順ノート（つなぎ方（経路）ごとに 1 つのノート。いくつもの接続で同じノートを使える）・つながらないときの案内 | 接続の `note_path`（v16。ノートのフォルダからの相対パス。`NoteService.move` が `store.dbConnections.remapNotePath` で付け替える）・置き場所 `DB_NOTE_DIR`（`DB/`）・タブ `DbNoteTab`（`src/features/database/ui/dbClientTabs.ts`）・失敗の種類 `DbFailureKind`（`src/features/database/ui/connection/dbFailure.ts` の `dbFailureKind`・よくある原因 `DB_FAILURE_CAUSES`・「AI に渡す」の一言 `dbFixText` と札の中身 `dbFailureDocument`）・案内 `DbFailureDialog` |
| つなぐ前の準備（つなぐ前に流すコマンド・切るときの後片付け・ポートを転送するコマンド・パスワードを取るコマンド。初めて・中身を変えたあとは確かめてから流す）と次に確かめる日 | 接続の `prep`（`DbPrep`。v18）・確かめたか `prep_confirmed`（確かめていなければ 409 と `DB_PREP_UNCONFIRMED`）・`check_on` / `check_note`・記録 `DbPrepRun`（表 `db_prep_runs`）・いまの様子 `DbPrepState`（ワーカーのメモリだけ）・`{名前}` の埋め方 `@shared/database/dbPrep.ts`・ワーカーの `worker/prep.ts` と `worker/shell.ts`・画面の `ConnectionPrepFields` / `DbPrepDialog` |
| テーブルの行の変更（段階 3 のセルの編集・行の追加と削除・CSV の取り込み。保存するまで画面に持つ） | 変更 `DbRowEdit`（`update` / `insert` / `delete`。行はキー `DbKeyValue` で指し、値は `DbEditValue`）・本文 `DbEditsBody` / 結果 `DbEditsResult`（`POST …/db-connections/:cid/edits`。1 回に `DB_EDITS_MAX` 件まで）・SQL の組み立て `@shared/database/dbEdit.ts`（`editStatements`・行を指す列 `editKeyColumns`）・ワーカーの `apply`・画面の保存していない変更 `TableEdits`（`src/features/database/ui/table/tableEdits.ts`）・`useTableEdits` |
| SSH トンネル（踏み台を通して DB につなぐ。初めての踏み台は鍵の指紋を確かめる） | 接続の `ssh`（`DbSsh`: `host` / `port` / `user` / `identity_file`。v17）・パスワード `db_connection:<ID>:ssh_password`（`has_ssh_password`）・ワーカーの `worker/tunnel.ts`（`createTunnels`。同じ踏み台と DB へのトンネルは使い回す）・初めての踏み台の印 `DB_SSH_UNKNOWN_HOST`（409）・鍵 `DbSshHostKey`（`sshHostKey.ts`）・画面の `SshHostKeyDialog` |
| SQL の履歴（接続ごと。AI が流したものに印） | `DbQueryHistoryEntry` / 表 `db_query_history`（v14。`ran_by` = `user` / `ai`、AI なら `chat_id`。接続ごとに新しい `DB_HISTORY_MAX`（500）件だけ残す）・店 `store.dbQueryHistory` |
| DB ワーカー（DB の接続・SQL の実行・結果の整形・SSH トンネル・準備のコマンドを動かす別のプロセス。初めて DB を使ったときに立ち上げ、何もしない状態が 5 分続いたら止める（準備のコマンドを流している間は止めない）） | `src/features/database/worker/`（Electron ではコアのプロセスの頼み（RPC の `dbWorker.spawn`）でメインプロセスが `utilityProcess` で `out/main/dbWorker.js` を起動し、コアと MessagePort で直結する（製品版は Electron の fuses で RunAsNode をオフにするので `ELECTRON_RUN_AS_NODE` は使わない）、`npm run daemon`・テストでは `worker/main.ts` を tsx で fork。コアの側は登録の表とワーカーとのやり取り `DbWorkerClient` だけ） |
| Docker タブ（プロジェクトの画面の上のタブ「Docker」（「DB」の隣）。本体とワークツリーの compose のサービスを見て、起動・停止し、ログをタブの中のログの画面で見て、シェルを下のパネルのターミナルで開く。この Mac のアプリの中だけ。要件定義書の「5.14 Docker」。段階 1 と段階 2「DB で開く」を作った） | タブ `docker`（`#/projects/:id/docker`）・画面 `src/features/docker/ui/`（状態と操作の hook `useDocker`・描く部品 `DockerPane`・ログの画面 `DockerLogs`）・コア `src/features/docker/core/`・API `GET /api/projects/:id/docker`（一覧）・`POST …/docker/actions`（操作）・`POST …/docker/watch`（見ています）・`GET …/docker/logs`（ログの流れ・さかのぼり）・`GET …/docker/db`（「DB で開く」の行き先）・SSE `docker_changed`（`project_id`）・共有の型 `src/shared/docker/types.ts` |
| ワークツリーの実行環境（ワークツリーごとにポートの番号と Docker の組の名前を分け、本体と複数のワークツリーのアプリを同時に動かす。要件定義書の「5.16」）と帯（ワークツリーに渡す 100 個ずつの番号のまとまり。20100〜29900 の 99 本。+00 は開発サーバー、+01 から Docker の公開ポート）・対応表（本体の番号 → 帯の番号）・整えきれていない所（手順で分けきれなかった所）・分けられない理由 | `WorktreeEnv`・`WorktreePortSlot`（`src/shared/worktrees/envTypes.ts`）・表 `worktrees` の `env_` の列（色 `hue` と同じ行）・コア `src/features/worktrees/core/env/`（`WorktreeEnvService`）・`GitWorktree.env`・`issues`・`blocked`・ワークツリーの `.env` の Kickoff の区切りと `.kickoff/compose.worktree.yaml`・［AI で整える］のチャット（Git で管理していないファイルだけを書ける）= `Chat.untracked_only`（v23） |
| ポートを使っているプロセス（Kickoff のプロジェクトのフォルダで TCP のポートを待っているもの。要件定義書の「5.17」）・起動元（Kickoff の中 / 切り離されている / ほかのアプリ）・帯の添え書き | `PortProcess`・`PortOrigin`（`PORT_ORIGINS`）・`PortBandNote`（`src/shared/ports/types.ts`）・コア `src/features/ports/core/`（`PortProcessService`・`PortWatch`）・SSE の `ports_changed` |
| compose（Docker タブの見出し。compose のファイルごとに 1 つ。プロジェクトフォルダからの場所と作業場所の札を出す）・サービス（compose に書いた 1 つ 1 つ。行）・コンテナ（サービスから作ったもの。「作っていない」サービスもある） | 見つけ方とファイルの選び方 `src/features/docker/core/compose.ts`（中身は `docker compose -f … --profile '*' config --format json` に聞く。YAML は読まない） |
| 組の名前（compose のプロジェクト名。`-p` / `name:` / `COMPOSE_PROJECT_NAME`。Kickoff のプロジェクトと混ざるので、画面でも文書でも「プロジェクト」と呼ばない） | ラベル `com.docker.compose.project`（作ってあるもの）・`config --format json` の `name`（作っていないもの） |
| 札付きのサービス（compose の `profiles:` の札が付いた、必要なときだけ使うサービス。薄く並べ、「すべて起動」に含めない）・使い捨てのコンテナ（`docker compose run` で作ったもの。サービスの行の下に畳む） | `profiles`・ラベル `com.docker.compose.oneoff=True` |
| 同じ組（2 つの作業場所、または同じ作業場所の 2 つの compose が同じ組の名前になること。コンテナとボリュームを共有し、片方の up でもう片方が作り直される） | 見出しの ⚠・起動の前の［起動する］［やめる］ |
| ログの画面（Docker タブの中、一覧の下に出す compose のログ。サービスの札で絞り込み、時刻の順に並べる。区切りの行 = 見ている間にコンテナが止まった・起動し直したことを示す行。エラー・警告の印は行の文字の決まりで付ける目安） | 画面 `src/features/docker/ui/DockerLogs`・コア `src/features/docker/core/logs.ts`（コンテナごとの `docker logs --timestamps`）・エラーと警告の見分け `@shared/docker/logLevel.ts` |
| ポートの取り合い（Docker 同士。up が失敗してから相手を出す）・静かなぶつかり（Docker の外のプロセスが同じ番号で待っている。起動は成功し、127.0.0.1 への接続は外のプロセスが受ける） | `src/features/docker/core/portConflict.ts`（`lsof -nP +c 0`・エンジンの名前の一覧・`brew services info --all --json`） |
| AI の Docker の守り（別の作業場所のコンテナを止める・消す・作り直す、ボリュームを消す、まとめて止める・消す AI の Bash を、Auto mode でも承認カードで聞く） | `src/features/docker/core/guard/dockerGuard.ts`（待てる PreToolUse。承認は `requestApproval`・`canRemember: false`） |
| AI の書き込み先の守り（AI がファイルのツールで書ける場所 = 作業場所・ノートのフォルダ・決まりの例外。同じリポジトリのほかの作業場所は断り、それ以外の外は Auto mode でも承認カードで聞く）・このチャットでは許可（承認カードの「覚える」ボタンの範囲。許したファイルはそのチャットの間もう聞かない） | `src/features/guard/core/guard/writeScope.ts`（`judgeFileWrite`・`WriteScopeParams`。Claude は守りの門の PreToolUse のフック 1 つで聞いて待つ）・`RememberScope`（`rule` = 常に許可 / `chat` = このチャットでは許可。`REMEMBER_SCOPE_LABELS`。承認の `remember_scope`）・`ChatRun.writeAllowed` |
| AI の Bash の砂場（AI の Bash が書ける場所を、作業場所・ノートのフォルダ・決まりの例外だけにする。止めるのは OS）・砂場の外で流すコマンド（砂場の中では動かないもの = Electron の起動・brew install など）・通信の中継（Bash の通信をどこへでも通す。ネットワークは絞らない） | `src/features/guard/core/sandbox/bashSandbox.ts`（`bashSandboxFor`・`SandboxPlan` の `writableDirs` / `readOnlyDirs` / `unsandboxedCommands` / `proxyPort`。`ProviderTurnParams.sandbox`・`sandboxOff`。OS の決まりは `CorePlatformParts.agentSandbox`）・`src/features/guard/core/sandbox/networkRelay.ts`（`startNetworkRelay`）・Claude Code の設定に直すのは `providers/claude/sandbox.ts` の `claudeSandbox` |
| 本体（スマホから見た、Kickoff のコアが動いている PC。いまは Mac）・本体の ID（本体を見分ける ID。スマホが複数の本体を切り替える目印。DB を作ったときに決め、DB を写して開発版を作ったら作り直す）・端末（この Mac の Kickoff を外から使うスマホなど。1 台ずつつなぎ、1 台ずつ取り消す）・端末ができること（使える / 見るだけ。見るだけの端末はチャットを読めるが、送る・答える・止めるはできない） | `DeviceAccess`（`full` / `read`。`DEVICE_ACCESS_LABELS`。表 `devices` の `access`（v25）。断る印 `DEVICE_READ_ONLY`）・`Store.databaseId`（`meta` の `database_id`。`/api/status` の `database_id`）・`Device`（`src/shared/devices/types.ts`）・表 `devices`（v24。トークンは hash だけ・プッシュの宛先 `push` は外に出さない）・店 `store.devices`・`core/system/devData.ts` の `becomeAnotherHost` |
| スマホのアプリ（Android。本体に Tailscale 経由でつなぎ、チャットを見る・送る・答える。ターミナルも） | `mobile/`（Expo。`mobile/CLAUDE.md`）・本体とのやり取りは `HostClient`・SSE は `readSse`・本体の一覧 `HostRegistry` |
| スマホ連携のオン・オフ（スマホからつなぐか。オンのときだけ端末の登録を受け付け、端末からの頼みを受け、電源につないでいる間は本体を眠らせない。待ち受けは 127.0.0.1 のまま） | 設定の `remote_enabled`（前は「LAN に公開」の意味だったが効いていなかった。2026-11-14 に決め直した）・断る印 `MOBILE_OFF` |
| 呼び主（API を呼んだのが、この Mac の画面か、つないだ端末か。どのトークンで来たかだけで決める）・端末に開く口（端末から使える API。既定は閉じていて、書いたものだけ開く） | `Caller`（`core/http/caller.ts`。`host` / `device`）・取り決めの `access`・`deviceAccess`（`core/http/deviceAccess.ts`）・SSE の表の `access`（`deviceEventTypes`）・403 の印 `DEVICE_FORBIDDEN` |
| ペアリング（端末をつなぐこと。Mac の画面が使い捨ての番号と QR を出し、端末が番号で頼み、Mac の画面で「この端末をつなぎますか」と確かめてから端末のトークンを 1 回だけ渡す）・つなぐ先の URL（端末から Mac の Kickoff に届く URL。QR に入れる） | `PairingCenter`（`src/features/devices/core/pairing.ts`）・`PairingState` / `PairingRequest` / `PairingClaimBody` / `PairingPollResult`（`src/shared/devices/types.ts`）・`pairingLink`（`@shared/devices/pairing.ts`）・設定の `mobile_url`・画面の `src/features/devices/ui/settings/MobileSettings.tsx` |
| 通知の判断（チャットの完了・失敗・回答待ち・CI の失敗を、それを見ていない人（この Mac の画面・端末）にだけ知らせる）・見ているもの（前に出しているチャット・CI のタブ。呼び主ごと） | `src/features/notifications/core/`（`NotificationCenter` / `Notice` / `PushSender` / `ViewingRegistry`）・`PUT /api/viewing`（`ViewingBody`）・`startCore({ notify, push })` |
| API の版（Mac の Kickoff とスマホのアプリのやり取りの形の番号。Kickoff の版とは別に持ち、形を壊す変更をしたときだけ 1 つ上げる。1.0 からは変更を「足すだけ」（項目を消さない・名前を変えない）にし、壊すなら版を上げる。0.x の間は壊してよい）・話が通じない（アプリが古すぎる / Mac の Kickoff が古すぎる） | `src/shared/foundation/api/version.ts`（`API_VERSION` / `MIN_CLIENT_API_VERSION` / 見出し `x-kickoff-api` / `client_too_old`・`host_too_old` / `apiMismatch`）・SSE の最初の行 `ServerHello`・`ServerStatus.api_version` |
| 外の画像（返答の Markdown の http・https の画像。押すまで外へ通信せず「{ホスト} から画像を n 件表示」のボタンにする）・画像の表示の許可（そのボタンを押したホスト。チャットごと）・外部リンク（返答などの http・https のリンク。開く前に毎回確かめる）・確認せずに開くドメイン（確認の画面の「今後確認しない」で覚えたもの。アプリ全体） | `@shared/remoteImages/remoteImages`（`RemoteImage`・`remoteImageOf`）・`ChatImageHost`・表 `chat_image_hosts` / `chat_image_cache`・`src/features/remoteImages/core/`（`RemoteImageService`）・`src/features/remoteImages/ui/`・`@shared/remoteImages/linkWarnings`（`LINK_WARNINGS`）・設定の `link_open_in` / `trusted_link_domains`・`src/foundation/ui/external/linkOpen.ts` |

### チャットの軸とエージェントの軸

「親・子」と「メイン・サブ」は別の軸なので、画面の言葉で混ぜない。

| 軸 | 画面の言葉 | コード |
|---|---|---|
| チャット（利用者が作る会話。木） | 親チャット / 子チャット / 孫チャット / ひ孫チャット（関係で呼ぶ。`@shared/childChats/childDepth` の `childDepthLabel`）。右の欄・別ウィンドウで文を足す先のチャット（右の欄を持つチャット・別ウィンドウを開いたチャット）は「メイン」と呼ばず、名前で出す（「「機能開発」に追加」。`src/features/chat/ui/chatTitle` の `chatTargetName`） | `Chat.parent_chat_id`・足す先 `MainChatContext`（コードの名前は残す） |
| エージェント（1 つのチャットの中で動く AI。木） | メインエージェント / サブエージェント。サブエージェントから見た上は「起動したエージェント」（入れ子なら外のサブエージェント）で、「親」と呼ばない | `SubagentEntry.parentKey`・`subagentTree` |
| ウィンドウ | メインウィンドウ / 別ウィンドウ | `src/foundation/ui/navigation/`・`src/app/renderer/PopoutApp.tsx` |

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
- HTTP API・SSE・DB に出る相対パス（ファイル・ノート・検索の結果・Git の一覧・compose のファイル・取り込みの SQLite のファイルなど）の区切りは、OS によらずいつも「/」。コアは外に出す前に `core/system/paths.ts` の `toApiPath` / `relativeApiPath` を通す（Git の出力はもともと「/」）。受けたパスは `path.join` がどちらの区切りも読むので、そのまま使う。画面・スマホは区切りを OS で読み分けない。絶対パス（`repo_path`・`worktree_path` など）は OS の形のまま。

## 3. ディレクトリ構成

```
src/
  shared/                 純粋（Node・DOM・React・Electron・npm のパッケージに依らない）。コア・画面・メイン・preload・スマホが読む。import は @shared/…
    foundation/           機能に依らない純粋な土台（errors・path・text・time・format・api・ipc・testing …）
    <機能>/               その機能の型・コアと画面とスマホが同じに使う決まり
  foundation/             土台（機能の言葉を持たない）
    core/                 コアの土台（db/・http/・bus・system/・platform/・workplace/・aiTools/・settings/・host/・testing/）
    ui/                   画面の土台（kit/・store/・storage/・api/・navigation/・workplace/・markdown/・code/・external/・theme/・shell/ と CSS の決まり styles/CLAUDE.md）
    desktop/              メインプロセスの土台（app/・ipc/・platform/・notifications/・terminal/）と preload/
  features/<機能>/        機能（チャット・AI・パネル・Git・DB クライアントなど）
    core/                 コアの部分（ルート routes/・表の店 db/・サービス・AI のツール）
    ui/                   画面の部分（部品・店・API の窓口 api/・設定の節 settings/）
    desktop/              メインの部分（browser と diagnostics だけ）
    worker/               別プロセスの入口（database だけ）
    CLAUDE.md             地図・決まり・落とし穴
  app/                    組み立て（ここだけが全部の機能を知る）
    core/                 startCore.ts（起動）・assemble.ts（機能の組み立て）・daemon.ts（Electron なしで起動）・hostMain.ts / hostRun.ts（Mac のアプリのコアのプロセス）・testing/
    desktop/              index.ts（メインの起動の順番）・preload.ts
    renderer/             index.html・main.tsx・App.tsx・PopoutApp.tsx・styles/（index.css の @import の順でつなぐ CSS）・public/
mobile/                   スマホのアプリ（Android。Expo。別の npm のまとまり。@shared は ../src/shared を読む）
scripts/  docs/           道具と文書
```

依存の向きはルートの `CLAUDE.md` の「層と依存の向き」（土台は機能を読まない・機能は下の機能の入口だけを読む・コアと画面は互いに import しない）。機能の上下の並び（`FEATURES`）と層ごとの読んでよい先は `scripts/structure.config.mjs` に書き、コミット時に `scripts/check-structure.mjs` が確かめる（いまある違反は基準線 `scripts/structure-baseline.json` に載せて減らす）。

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
4. パネル: 3 つの欄の違いを 1 つの欄の項目（`panelSurfaces`）に、タブの種類の違いを 1 つの表に、`usePanel` の状態の更新を純粋関数に。
5. チャットの画面: 子の部品への操作の配り方（props・4 つの context・ref・クラス名での DOM 検索）を 1 つの context に。押すと上に開く一覧（9 か所）・キー操作（Enter と日本語入力・Esc・ピントの判定）・書き直しの欄・添付のボタン。
6. 汎用: ポップオーバー（`Popover`）、メニューは描いてから測って画面に収める（手での大きさの見積もり 22 か所をなくす）、つまみのドラッグ（`useDragSize`。6 実装）、操作の実行中と失敗（`useAction`）。
7. API の窓口を資源ごとに分け、応答の型は `src/shared/foundation/apiTypes.ts` に（画面側の手書きをなくす）。

### メイン・テスト
1. IPC の取り決め（30 本のチャンネル名と型の二重書き）を `src/shared/foundation/ipc` に。登録は型付きの補助で、引数の検査もそこで。
2. 診断の DB の集計をコアへ（メインが生の SQL を流していた）。
3. テストのデータを作る関数（`Chat` を作る関数が 9 ファイル、記録が約 10 ファイル）と、一時フォルダ（片付けない所が多い）・Git の作業場所の準備を共通に。1,000 行を超えるテストを分ける。

## 決めたこと（測った数）

作らなかった形・選んだ形の根拠になった数。

- 会話の流れの読んでいた位置（`useTimelineWindow`）: ブラウザのスクロールアンカーに任せ、いちばん上（scrollTop 0）で前に項目が増えたときだけ JS で直す。アンカーを切って JS だけで保つ形と比べ、上へ読み進めたときのずれが最大 0.7px 対 3,300px だった（JS で位置を書き換えると慣性のスクロールも止まる）。
- macOS の音声認識が使えるかの確かめ（`kickoff-speech` の check）: ふつう 0.1 秒ほどで終わるので、結果を覚える仕組みは作らず、毎回聞く。
- 記録が届いたときの作り直し（`defineChatSelector` の取り出し口）: 記録全体から作り直しても、確かめ用のチャット（末尾と索引で約 1,600 件）で 0.3ms（95% で 0.8ms）なので、届いた分だけ計算する形は作らない。
- 裏のタブの会話の欄を `Activity` の hidden で止める（`ChatScreen.tsx`）: 裏に 6 つのチャットを開き、表で返答を書かせながら打つと、1 文字の遅れが中央値 22ms → 15ms（95% で 23ms）、裏のタブを表に戻すのが 77ms → 68ms になった。
- チャットの流れの窓（`useRowWindow`）: 数千ターンのチャットで要素が 10 万個を超え、画面が真っ黒になった。窓にすると、上へ 50 画面読み進めても要素は 200 個ほど（窓なしは 1,300 個、250 画面で 8,300 個）。
- サイドバー・ボードは窓にせず、開いた直後だけ段階に分けて描く（`useProgressivePage`）: ⌘F・キーでの移動・ドラッグが、すべての行が DOM にあることを前提にするため。1,000 チャットで最初に見えるまでが、サイドバー 144〜270ms → 29〜51ms・ボード 226〜378ms → 30〜113ms・全プロジェクト 約 450ms → 48〜68ms、いちばん長いタスクが 120〜350ms → 0〜85ms（JS の合計はほぼ同じ。`scripts/perf/lists.mjs`）。
- 一番下への付いていき（`src/features/chat/ui/parts/followScroll.ts`）: 伸びるたびに effect で `scrollTop = scrollHeight` を書くと、書いている最中の入力 1 文字に 50ms ほどかかった。大きさの知らせの中で、ずれたときだけ寄せる。
