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
| 圧縮前指示（会話を圧縮する前に AI に送る指示。メモを残してもらうなど。設定の共通の指示 → プロジェクトの指示の順につなぐ） | 設定・プロジェクトの `pre_compact_prompt`・`@shared/chat/prompts` の `compactPromptFor`・記録の `user.pre_compact`・`core/chat/preCompact.ts`・PreCompact フック `core/providers/claude/preCompact.ts` | なし |
| 圧縮後指示（会話を圧縮したあと、圧縮の間に預かった指示より先に AI に送る指示。メモを読み直してもらうなど。つなぎ方は圧縮前指示と同じ） | 設定・プロジェクトの `post_compact_prompt`・`@shared/chat/prompts` の `postCompactMessage`・記録の `user.post_compact`・送信待ちの `QueuedMessage.post_compact`・`core/chat/preCompact.ts` の `postCompactItem` | なし |
| 送信待ち | `Queue`（`chat_queues`） | `followups` / `run_queues` |
| 送信待ちに挟む行（会話の圧縮・コンテキストの消去） | `QueueAction`（`compact` / `clear`。`QueuedMessage.compact` / `clear`・`@shared/chat/queueActions`） | 圧縮の予約だけ |
| コンテキストの消去（これまでの会話を AI に引き継がず、次から新しい会話で始める。記録は残す） | `Runner.clearContext`・記録 `context_cleared`（巻き戻し・子チャットの引き継ぎはこの境目を越えない `core/chat/sessionPoints.ts`） | なし |
| 作業中の様子（保存しない） | `ChatLive` | 詳細と SSE で別々の形 |
| チャットの選択（モデル・深さ・権限・ファスト） | `ChatOptions`（`model` / `effort` / `permission_mode` / `fast_mode`） | `RunOptions`・`ProjectDefaults`（`permission` / `fastMode`）・設定（`claudeModel` / `defaultPermission`）・`ProviderRunParams`（`permissionMode`）の 4 通り |
| 権限モード | `PermissionMode` | `PermissionChoice` |
| 未読 / 既読 | `unread` / `read` | `attention`・列の `review` / `done` |
| タブの入れ物（右のパネル・チャット欄・下のパネル・右の欄） | `Panel`（`usePanel`） | `SidePanel`（3 か所で使うのに「横」） |
| 右の欄（チャットの画面の右に、サブエージェントの画面を並べる欄。チャットのタブの中に入れ子にしたタブの入れ物） | 欄 `agents`（`SURFACES.agents`・`AgentSplit`）・タブの種類 `subagent`・画面 `SubagentScreen` | パネルのタブで開くサブエージェント（`SubagentPane`。メインとのつながりが見えないのでやめた） |
| チャットタブ（チャットをボードと分けて横幅いっぱいに開くプロジェクトのタブ。設定でボードの右のパネルにも戻せる） | タブ `chats`（`#/projects/:id/chats`）・`ChatsTab`・置き方の設定 `CHAT_PLACEMENT`（`separate` / `together`）。中身はボードの右のパネルと同じ `kanban:<プロジェクト>` のパネル | ボードの右のパネルだけ |
| メモ（プロジェクトの「メモ」タブ。プロジェクトの外のフォルダの Markdown か HTML（HTML のメモ = HTML と CSS で書くページ。描いた見た目で見る）） | メモのフォルダ（設定 `memos_dir` の下の、プロジェクトの `memo_folder`。別の場所なら `memo_path`）・`MemoService`（`core/memos/`）・`MemoTab`（`features/memo/`） | なし |
| メモのチャット（メモの右の欄で話す、メモごとに 1 つのふつうのチャット。一覧には並べず、そのメモの右の欄から開く。AI はメモのファイルを直接読み書きする） | `Chat` の `memo_path`・`POST /api/projects/:id/memo/chat`・`MemoChat`（`features/memo/`） | なし |
| 子チャット（チャットの発言から「子チャットで聞く」・右の欄の「＋」の「新しい子チャット」で始める横道の質問。親の中にだけ置き、いちばん上の親の右の欄か別ウィンドウで開く（設定 `CHILD_CHAT_OPEN_IN`。作ったときは `CHILD_CHAT_OPEN_ON_CREATE` で、開かないも選べる）。孫・ひ孫も作れる） | `Chat` の `parent_chat_id`（親）・`parent_event_id`（聞いた発言）・`startChildChat`（`core/chat/children.ts`）・`features/chat/children/` | なし |
| 会話 / 動き（チャットの画面の見え方。動き = メインとすべてのサブエージェントの動きを 1 本の時系列に） | `ChatShowing`（`conversation` / `activity`）・`ActivityRow`（`features/chat/activity/`） | なし（サブエージェントは別のタブ） |

## 2. 名前の決まり

- HTTP API・SSE・DB に出る形は snake_case（設定 `AppSettings` も）。コードの変数・関数、画面の中だけの型、Electron の IPC の形は camelCase。
- 外のツールの形をそのまま写すもの（Claude Code の AskUserQuestion の `multiSelect` など）は、そのままにする。
- 「ない」は `null`（空文字で「本体」「不明」を表さない。`worktree_path` が `null` なら本体）。
- 状態の値は 1 か所の定数（`as const` の配列）から型を作り、画面の文言は同じ場所の `…_LABELS` に置く。

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
  post_compact_prompt TEXT CHECK (post_compact_prompt <> '')
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
  archived_with_parent INTEGER NOT NULL DEFAULT 0 CHECK (archived_with_parent IN (0, 1))
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
```

### 記録（chat_events の data）

`ChatEvent` は `type` で中身が決まる判別共用体にする（以前は `data` が `type` と結びついておらず、`event.data as …` が 50 か所あった）。新しい DB なので「以前の記録にはない」ための任意の項目は必須にする。

| type | data | 以前からの変更 |
|---|---|---|
| `user` | `text` `attachments` `message_uuid` `handover?` `pre_compact?`（圧縮前指示。text は指示の文だけで、AI には前置きを付けて渡す）`post_compact?`（圧縮後指示。同じく前置き `postCompactMessage` を付けて渡す） | `message_uuid` を必須に |
| `init` | `session_id` `model?` `permission_mode?` `effort?` | |
| `text` / `thinking` / `tool_use` / `tool_result` | 以前どおり＋`parent?`（サブエージェントのもの） | `sub` をなくす（`parent` があればサブエージェント） |
| `approval` | `approval_id` `kind` `tool_name` `title?` | |
| `approval_resolved` | `approval_id` `kind` と、`action` が `answer` なら `answers` `attachments?` | `kind` を必須に、回答は `action` で判別 |
| `result` | `status`（completed / failed / cancelled）`text?` `session_id?` `message_id?` `network?` `usage_limit?` | 読まれない `cost_usd` `turns` をなくす。使用枠の上限で止まったら `usage_limit`（以前は画面が文を正規表現で読み直していた） |
| `error` / `notice` | `message` | |
| `compact` | `trigger` `pre_tokens` `post_tokens?` | |
| `subagent` | `SubagentInfo` | |

### 設定（AppSettings）

snake_case にし、チャットの選択の既定を `ChatOptions` 1 つにまとめる: `default_provider` / `chat_defaults`（`ChatOptions`）/ `remote_enabled` / `ntfy_url` / `desktop_notifications` / `projects_dir` / `auto_resume_on_reconnect` / `auto_archive_days` / `voice_enabled` / `voice_provider` / `voice_language` / `voice_model` / `voice_openai_base_url` / `voice_openai_model` / `pre_compact_prompt` / `post_compact_prompt`（圧縮前指示・圧縮後指示の共通の分）。選択はチャット → プロジェクトの `chat_defaults` → 設定の `chat_defaults` の順に、同じ形を重ねて決める（`resolveChatOptions`）。

### DB を作り直したときの画面の状態

ID 入りの localStorage のキー（グループの開閉・下書き・送信待ちの表示など）は、新しい DB の別のものを指してしまう。画面は起動したときに `/api/status` の `database_id` と覚えている値を比べ、違えば ID 入りのキー（`storageKeys.ts` で印を付けたもの）を消す。

## 4. ディレクトリ構成

```
src/
  shared/              どのプロセスからも使う型と純粋な関数（Node・DOM・Electron・React に依存しない）。import は @shared/…
    types/             API・SSE・DB の形（chat / chatEvent / chatLive / project / approval / settings / provider / git / voice / events / api）
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
    git/               Git（exec・status・files・changes・history・worktrees）・GitHub・取り込みの点検・ワークツリーの準備
    usage/             使用状況（Claude のプランの枠と、ほかのサービス services/）
    voice/             音声入力の文字起こし
    memos/             プロジェクトのメモ（プロジェクトの外のフォルダの Markdown・HTML の一覧・読み書き・移動・ゴミ箱・チャットの文から作る・HTML のメモが読むファイルを返す）
    system/            外部コマンド・パス・ログインシェルの環境・期限付きキャッシュ・保存先と名前（appEnv）・開発版のデータの写し
    testing/           テストの補助（サーバーの準備・偽のプロバイダー・一時フォルダ・Git の作業場所）
  main/                Electron のメインプロセス
    index.ts           起動の順番だけ
    app/               ウィンドウ・メニュー・終了の片付け・子の Electron・権限の問い合わせ・起動の記録
    ipc/               IPC の登録と引数の検査
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
      editor/  history/  worktree/
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

