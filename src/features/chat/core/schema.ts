import type { Chat } from "@shared/chat/types";
import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";

/**
 * チャット（v1）。
 * - chats: 子チャットは parent_chat_id（親を消すと子孫も消える）と parent_event_id（親の会話のどの記録から聞いたか）。note_path はノートのチャットのノート
 *   （ノートのフォルダからの相対）。github_* は結び付いた issue・PR（3 つがそろって NULL か、そろって値がある。表の CHECK）。untracked_only は Git で管理していない
 *   ファイルだけを書けるチャット。resume_pending は前回の終了で作業の途中で止まった印、ai_generation は AI が作った世代（どちらも店の中だけ）。
 *   archived_with_parent は親と一緒にアーカイブした印、trashed_with は一緒にゴミ箱に入れた行（trash_items.id）。position は手動の並び（null = まだ並べていない）
 * - chat_events: 自分の発言とメインの AI の返答（type が user / サブエージェントでない text）の文は生成列 text に出し、全文検索の索引 chat_event_search
 *   （trigram で部分一致）はビュー chat_event_texts を中身にしてトリガーで追従させる。idx_chat_events_meta は記録の軽い形と大きさを data を解かずに読む覆う索引
 *   （式は店の SQL と同じに書く。チャットごとの読み取りはこれか主キーで引くので (chat_id, id) だけの索引は作らない。eventIndex.test.ts）
 * - session_id: いまの AI（provider）のセッションの正（離れた AI のセッションは providerSwitch の chat_provider_sessions）
 * - agent_sessions: Kickoff が作ったセッションの覚え（チャットを消しても残す。使われなくなったら会話記録をゴミ箱へ）
 */
export const CHAT_SCHEMA_V1 = `
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES chat_groups(id) ON DELETE SET NULL,
  parent_chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
  parent_event_id INTEGER CHECK (parent_event_id > 0),
  note_path TEXT CHECK (note_path <> ''),
  github_repo TEXT CHECK (github_repo <> ''),
  github_number INTEGER CHECK (github_number > 0),
  github_kind TEXT CHECK (github_kind <> ''),
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT,
  effort TEXT,
  permission_mode TEXT NOT NULL,
  fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1)),
  sandbox_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sandbox_enabled IN (0, 1)),
  edit_scope_enabled INTEGER NOT NULL DEFAULT 1 CHECK (edit_scope_enabled IN (0, 1)),
  untracked_only INTEGER NOT NULL DEFAULT 0 CHECK (untracked_only IN (0, 1)),
  worktree_path TEXT CHECK (worktree_path <> ''),
  branch TEXT CHECK (branch <> ''),
  finished_worktree_branch TEXT CHECK (finished_worktree_branch <> ''),
  status TEXT NOT NULL,
  session_id TEXT,
  error TEXT,
  turn_started_at TEXT,
  unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
  resume_pending INTEGER NOT NULL DEFAULT 0 CHECK (resume_pending IN (0, 1)),
  ai_generation INTEGER NOT NULL DEFAULT 0 CHECK (ai_generation >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  num_turns INTEGER NOT NULL DEFAULT 0 CHECK (num_turns >= 0),
  context_tokens INTEGER,
  context_window INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  position INTEGER,
  archived_at TEXT,
  archived_with_parent INTEGER NOT NULL DEFAULT 0 CHECK (archived_with_parent IN (0, 1)),
  trashed_at TEXT,
  trashed_with TEXT CHECK (trashed_with <> ''),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  active_at TEXT NOT NULL DEFAULT (${NOW}),
  CHECK ((github_repo IS NULL) = (github_number IS NULL) AND (github_repo IS NULL) = (github_kind IS NULL))
) STRICT;
CREATE INDEX idx_chats_project ON chats(project_id, archived_at, active_at);
CREATE INDEX idx_chats_worktree ON chats(project_id, worktree_path) WHERE worktree_path IS NOT NULL;
CREATE INDEX idx_chats_group ON chats(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_chats_running ON chats(status) WHERE status = 'running';
CREATE INDEX idx_chats_parent ON chats(parent_chat_id) WHERE parent_chat_id IS NOT NULL;
CREATE INDEX idx_chats_note ON chats(project_id, note_path) WHERE note_path IS NOT NULL;
CREATE INDEX idx_chats_trashed_with ON chats(trashed_with) WHERE trashed_with IS NOT NULL;
CREATE INDEX idx_chats_resume_pending ON chats(resume_pending) WHERE resume_pending = 1;
CREATE TRIGGER chats_group_project_insert BEFORE INSERT ON chats
WHEN new.group_id IS NOT NULL AND (SELECT project_id FROM chat_groups WHERE id = new.group_id) IS NOT new.project_id
BEGIN
  SELECT RAISE(ABORT, 'chat group belongs to another project');
END;
CREATE TRIGGER chats_group_project_update BEFORE UPDATE OF group_id, project_id ON chats
WHEN new.group_id IS NOT NULL AND (SELECT project_id FROM chat_groups WHERE id = new.group_id) IS NOT new.project_id
BEGIN
  SELECT RAISE(ABORT, 'chat group belongs to another project');
END;
CREATE TABLE chat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object'),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  text TEXT GENERATED ALWAYS AS (
    CASE WHEN type = 'user' OR (type = 'text' AND json_extract(data, '$.parent') IS NULL) THEN json_extract(data, '$.text') END
  ) VIRTUAL
) STRICT;
CREATE INDEX idx_chat_events_meta ON chat_events(
  chat_id, id, type,
  json_extract(data, '$.id'), json_extract(data, '$.name'), json_extract(data, '$.parent'), json_extract(data, '$.tool_use_id'),
  json_extract(data, '$.task_id'), json_extract(data, '$.status'), length(data)
);
CREATE VIEW chat_event_texts AS SELECT id, text FROM chat_events WHERE text IS NOT NULL;
CREATE VIRTUAL TABLE chat_event_search USING fts5(text, content = 'chat_event_texts', content_rowid = 'id', tokenize = 'trigram');
CREATE TRIGGER chat_events_search_insert AFTER INSERT ON chat_events WHEN new.text IS NOT NULL BEGIN
  INSERT INTO chat_event_search (rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER chat_events_search_delete AFTER DELETE ON chat_events WHEN old.text IS NOT NULL BEGIN
  INSERT INTO chat_event_search (chat_event_search, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER chat_events_search_update AFTER UPDATE OF type, data ON chat_events BEGIN
  INSERT INTO chat_event_search (chat_event_search, rowid, text) SELECT 'delete', old.id, old.text WHERE old.text IS NOT NULL;
  INSERT INTO chat_event_search (rowid, text) SELECT new.id, new.text WHERE new.text IS NOT NULL;
END;
CREATE TABLE chat_outbox (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  now TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(now) AND json_type(now) = 'array'),
  later TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(later) AND json_type(later) = 'array'),
  stops TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stops) AND json_type(stops) = 'array'),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
) STRICT;
CREATE TABLE agent_sessions (
  session_id TEXT PRIMARY KEY CHECK (session_id <> ''),
  provider TEXT NOT NULL CHECK (provider <> ''),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  cwd TEXT NOT NULL CHECK (cwd <> ''),
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
`;

/**
 * chats の表の列（行の型は Chat。並びは DDL と同じ = 応答の項目の順）。ゴミ箱に入れた行（trashed_at）はふだん隠す。店の中だけの列は hidden。
 * 最後に動いた時刻 active_at を進めるのは、状態（status）を変える更新だけ（db/chats.ts の update）
 */
export const chatsTable = table(
  "chats",
  {
    id: col.int(),
    project_id: col.int(),
    group_id: col.int().nullable(),
    parent_chat_id: col.int().nullable(),
    parent_event_id: col.int().nullable(),
    note_path: col.text().nullable(),
    github_repo: col.text().nullable(),
    github_number: col.int().nullable(),
    github_kind: col.text<NonNullable<Chat["github_kind"]>>().nullable(),
    title: col.text(),
    provider: col.text<Chat["provider"]>(),
    model: col.text().nullable(),
    effort: col.text<NonNullable<Chat["effort"]>>().nullable(),
    permission_mode: col.text<Chat["permission_mode"]>(),
    fast_mode: col.bool(),
    sandbox_enabled: col.bool(),
    edit_scope_enabled: col.bool(),
    untracked_only: col.bool(),
    worktree_path: col.text().nullable(),
    branch: col.text().nullable(),
    finished_worktree_branch: col.text().nullable(),
    status: col.text<Chat["status"]>(),
    session_id: col.text().nullable(),
    error: col.text().nullable(),
    turn_started_at: col.time().nullable(),
    unread: col.bool(),
    resume_pending: col.bool().hidden(),
    ai_generation: col.int().hidden(),
    cost_usd: col.real(),
    num_turns: col.int(),
    context_tokens: col.int().nullable(),
    context_window: col.int().nullable(),
    pinned: col.bool(),
    position: col.int().nullable(),
    archived_at: col.time().nullable(),
    archived_with_parent: col.bool().hidden(),
    trashed_at: col.time().nullable().hidden(),
    trashed_with: col.text().nullable().hidden(),
    created_at: col.time(),
    active_at: col.time(),
  },
  { hide: { column: "trashed_at" } },
);
