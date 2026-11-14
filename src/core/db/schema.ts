import type { DatabaseSync } from "node:sqlite";

/** SQLite で今の時刻（ISO 8601・ミリ秒まで）を作る式 */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Kickoff のデータベースの印（PRAGMA application_id。'KICK'）。これがあれば、いまの系統（user_version は USER_VERSION_BASE ＋ 版） */
export const APPLICATION_ID = 0x4b49434b;

/**
 * v1 のスキーマ（docs/architecture.md の「3. スキーマ」）。すべて STRICT。真偽値は 0 / 1、JSON の列は json_valid と json_type で形を確かめる。
 * 値の一覧（状態など）は CHECK にしない（増やすたびに表を作り直すことになるため）。
 * 会話の記録のうち、自分の発言とメインの AI の返答（type が user / サブエージェントでない text）の文は生成列 text に出し、
 * 全文検索の索引 chat_event_search（trigram で部分一致）はビュー chat_event_texts を中身にして、トリガーで追従させる
 */
export const SCHEMA_V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) STRICT;
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (value <> '')
) STRICT;
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
INSERT INTO meta (key, value) VALUES ('database_id', lower(hex(randomblob(16))));
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  description TEXT NOT NULL DEFAULT '',
  repo_path TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  chat_defaults TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(chat_defaults) AND json_type(chat_defaults) = 'object'),
  reference_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reference_paths) AND json_type(reference_paths) = 'array'),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE TABLE chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  hue INTEGER NOT NULL CHECK (hue BETWEEN 0 AND 359),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_chat_groups_project ON chat_groups(project_id, position);
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES chat_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT,
  effort TEXT,
  permission_mode TEXT NOT NULL,
  fast_mode INTEGER NOT NULL DEFAULT 0 CHECK (fast_mode IN (0, 1)),
  worktree_path TEXT CHECK (worktree_path <> ''),
  branch TEXT CHECK (branch <> ''),
  status TEXT NOT NULL,
  error TEXT,
  session_id TEXT,
  turn_started_at TEXT,
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  num_turns INTEGER NOT NULL DEFAULT 0 CHECK (num_turns >= 0),
  context_tokens INTEGER,
  context_window INTEGER,
  unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  active_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_chats_project ON chats(project_id, archived_at, active_at);
CREATE INDEX idx_chats_worktree ON chats(project_id, worktree_path) WHERE worktree_path IS NOT NULL;
CREATE INDEX idx_chats_group ON chats(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_chats_running ON chats(status) WHERE status = 'running';
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
CREATE INDEX idx_chat_events_chat ON chat_events(chat_id, id);
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
CREATE TABLE chat_queues (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(messages) AND json_type(messages) = 'array'),
  stops TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stops) AND json_type(stops) = 'array'),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1))
) STRICT;
`;

/**
 * v2: プロジェクトのメモのフォルダ（memo_folder = 親フォルダの下のフォルダ名。初めてメモを使ったときに決める /
 * memo_path = このプロジェクトだけ別の場所にするときの絶対パス）
 */
const SCHEMA_V2 = `
ALTER TABLE projects ADD COLUMN memo_folder TEXT CHECK (memo_folder <> '');
ALTER TABLE projects ADD COLUMN memo_path TEXT CHECK (memo_path <> '');
`;

/**
 * v3: 子チャット（parent_chat_id = 親のチャット。親を消すと子孫も消える / parent_event_id = 親の会話のどの記録から聞いたか）。
 * 子チャットはサイドバー・ボードに並べず、親の中から開く
 */
const SCHEMA_V3 = `
ALTER TABLE chats ADD COLUMN parent_chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE;
ALTER TABLE chats ADD COLUMN parent_event_id INTEGER CHECK (parent_event_id > 0);
CREATE INDEX idx_chats_parent ON chats(parent_chat_id) WHERE parent_chat_id IS NOT NULL;
`;

/**
 * v4: メモのチャット（memo_path = どのメモについてのチャットか。メモのフォルダからの相対パス）。
 * メモのチャットはサイドバー・ボードに並べず、そのメモの右の欄から開く。メモの名前を変える・動かすと付け替える
 */
const SCHEMA_V4 = `
ALTER TABLE chats ADD COLUMN memo_path TEXT CHECK (memo_path <> '');
CREATE INDEX idx_chats_memo ON chats(project_id, memo_path) WHERE memo_path IS NOT NULL;
`;

/**
 * v5: 定型文（snippets）。チャット欄の上の帯から入力欄に入れる文。一覧は 1 つで、project_id が NULL なら共通（すべてのプロジェクト）、
 * 番号ならそのプロジェクトだけ（プロジェクトを消すと一緒に消える）。並び順 position はすべての定型文で 1 つの並び
 */
const SCHEMA_V5 = `
CREATE TABLE snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT CHECK (label <> ''),
  text TEXT NOT NULL CHECK (text <> ''),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_snippets_position ON snippets(position);
`;

/** v6: プロジェクトの圧縮前指示（会話を圧縮する前に AI に送る指示。設定の共通の指示のあとにつなぐ） */
const SCHEMA_V6 = `
ALTER TABLE projects ADD COLUMN pre_compact_prompt TEXT CHECK (pre_compact_prompt <> '');
`;

/**
 * v7: 親と一緒にアーカイブした子チャットの印（archived_with_parent）。親を戻すときは、この印のある子孫だけを戻し、
 * 子チャットだけで先にアーカイブしていたもの（印なし）はアーカイブしたままにする。前の版で親と一緒にしまった子（親としまった日時が同じ）にも付ける
 */
const SCHEMA_V7 = `
ALTER TABLE chats ADD COLUMN archived_with_parent INTEGER NOT NULL DEFAULT 0 CHECK (archived_with_parent IN (0, 1));
UPDATE chats SET archived_with_parent = 1
  WHERE parent_chat_id IS NOT NULL AND archived_at IS NOT NULL
    AND archived_at = (SELECT parent.archived_at FROM chats AS parent WHERE parent.id = chats.parent_chat_id);
`;

/** v8: プロジェクトの圧縮後指示（会話を圧縮したあとに AI に送る指示。設定の共通の指示のあとにつなぐ） */
const SCHEMA_V8 = `
ALTER TABLE projects ADD COLUMN post_compact_prompt TEXT CHECK (post_compact_prompt <> '');
`;

/** v9: プロジェクトの圧縮前指示・圧縮後指示を送るか（オフでも文は残す。設定の共通の指示の分は設定に持つ） */
const SCHEMA_V9 = `
ALTER TABLE projects ADD COLUMN pre_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pre_compact_enabled IN (0, 1));
ALTER TABLE projects ADD COLUMN post_compact_enabled INTEGER NOT NULL DEFAULT 1 CHECK (post_compact_enabled IN (0, 1));
`;

/**
 * v10: チャットの手動の並び（サイドバーの並び順「手動順」。プロジェクトの中の 1 つの並びで、まとまりの中はこの順に並べる）。
 * null = まだ並べていない（新しいチャット。手動順ではまとまりのいちばん上）
 */
const SCHEMA_V10 = `
ALTER TABLE chats ADD COLUMN position INTEGER;
`;

/**
 * v11: ワークツリーの PR の知らせで、確認を閉じた PR（同じ PR では確認を出し直さない。いくつもの窓・スマホのどこで閉じてもそろえるため DB に置く）。
 * ワークツリーを消して知らせがなくなったら、見張りが消す
 */
const SCHEMA_V11 = `
CREATE TABLE pr_notice_dismissals (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  dismissed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, pr_number)
) STRICT;
`;

/**
 * v12: プロジェクトごとの GitHub の連携（使うアカウント・連携先の remote。null なら gh で有効なアカウント・自動の remote）と、
 * ワークツリーの PR の見張りをするか
 */
const SCHEMA_V12 = `
ALTER TABLE projects ADD COLUMN github_account TEXT CHECK (github_account <> '');
ALTER TABLE projects ADD COLUMN github_remote TEXT CHECK (github_remote <> '');
ALTER TABLE projects ADD COLUMN pr_watch INTEGER NOT NULL DEFAULT 1 CHECK (pr_watch IN (0, 1));
`;

/**
 * v13: DB クライアントの接続（プロジェクトごと。段階 1 の項目だけ。SSH・準備のコマンド・手順メモなどは段階 2 で足す）。
 * パスワードは secrets の db_connection:<id>:password に置き、接続を消したら（プロジェクトごとの削除も）トリガーで消す
 */
const SCHEMA_V13 = `
CREATE TABLE db_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  engine TEXT NOT NULL,
  environment TEXT NOT NULL,
  host TEXT CHECK (host <> ''),
  port INTEGER CHECK (port > 0),
  database TEXT CHECK (database <> ''),
  username TEXT CHECK (username <> ''),
  file_path TEXT CHECK (file_path <> ''),
  ssl TEXT CHECK (json_valid(ssl) AND json_type(ssl) = 'object'),
  read_only INTEGER NOT NULL CHECK (read_only IN (0, 1)),
  ai_access TEXT NOT NULL,
  position INTEGER NOT NULL,
  last_connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_connections_project ON db_connections(project_id, position);
CREATE TRIGGER db_connections_drop_secrets AFTER DELETE ON db_connections BEGIN
  DELETE FROM secrets WHERE key LIKE 'db_connection:' || OLD.id || ':%';
END;
`;

/**
 * v14: DB クライアントの段階 2（AI の読み取り）。AI が流す SQL に使う別のユーザー（ai_username。パスワードは secrets の
 * db_connection:<id>:ai_password）と、SQL の履歴（接続ごとに新しい 500 件だけ残す。ran_by は user / ai、AI のものは chat_id）
 */
const SCHEMA_V14 = `
ALTER TABLE db_connections ADD COLUMN ai_username TEXT CHECK (ai_username <> '');
CREATE TABLE db_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  sql TEXT NOT NULL CHECK (sql <> ''),
  ran_by TEXT NOT NULL,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  row_count INTEGER,
  error TEXT,
  ran_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_query_history_connection ON db_query_history(connection_id, id);
`;

/** MIGRATIONS[n] でいまの系統の版 n → n+1 に上げる（変更は末尾に追記し、既存の要素は書き換えない） */
/** v15: DB クライアントの ER 図で動かしたテーブルの位置（接続と場所（DB・スキーマ）ごと。「自動で並べ直す」で消す） */
const SCHEMA_V15 = `
CREATE TABLE db_er_layouts (
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  place TEXT NOT NULL CHECK (place <> ''),
  positions TEXT NOT NULL CHECK (json_valid(positions) AND json_type(positions) = 'object'),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (connection_id, place)
) STRICT;`;

/** v16: DB クライアントの段階 2（接続の手順メモ）。メモのフォルダからの相対パス（いくつもの接続で同じメモを使える） */
const SCHEMA_V16 = `ALTER TABLE db_connections ADD COLUMN memo_path TEXT CHECK (memo_path <> '');`;

/** v17: 接続の SSH トンネル（null = 使わない。パスワードは secrets の db_connection:<id>:ssh_password） */
const SCHEMA_V17 = `ALTER TABLE db_connections ADD COLUMN ssh TEXT CHECK (json_valid(ssh) AND json_type(ssh) = 'object');`;

/**
 * v18: 接続のつなぐ前の準備のコマンド（prep: 準備・後片付け・ポートの転送・パスワードを取る・{my_ip} の問い合わせ先）・
 * 確かめた中身の写し（prep_confirmed。いまの prep と同じ間だけ確かめ済み）・次に確かめる日とひとこと、
 * 準備の記録（いつ・どのコマンド・成功 / 失敗だけ。出力は残さない）
 */
const SCHEMA_V18 = `
ALTER TABLE db_connections ADD COLUMN prep TEXT CHECK (json_valid(prep) AND json_type(prep) = 'object');
ALTER TABLE db_connections ADD COLUMN prep_confirmed TEXT CHECK (prep_confirmed <> '');
ALTER TABLE db_connections ADD COLUMN check_on TEXT CHECK (check_on <> '');
ALTER TABLE db_connections ADD COLUMN check_note TEXT CHECK (check_note <> '');
CREATE TABLE db_prep_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  command TEXT NOT NULL CHECK (command <> ''),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  ran_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_db_prep_runs_connection ON db_prep_runs(connection_id, id);
`;

/**
 * v19: チャットと GitHub の issue・PR の結び付き（どの issue・PR のためのチャットか。issue から始めた・レビューコメントで直すチャット）。
 * repo は「持ち主/名前」、kind は issue / pr（PR を作るとき「Closes #n」を足すのは issue だけ）。3 つがそろって NULL か、そろって値があるかは店で守る（ALTER TABLE では表の CHECK を足せないため）
 */
const SCHEMA_V19 = `
ALTER TABLE chats ADD COLUMN github_repo TEXT CHECK (github_repo <> '');
ALTER TABLE chats ADD COLUMN github_number INTEGER CHECK (github_number > 0);
ALTER TABLE chats ADD COLUMN github_kind TEXT CHECK (github_kind <> '');
`;

/**
 * v20: DB の接続の書き込む前の確かめ（write_check: dangerous / all / env_name。要件 5.12 の本番の守り）。
 * いまある接続は環境の既定にそろえる（ステージング = all・本番 = env_name・ほか = dangerous）
 */
const SCHEMA_V20 = `
ALTER TABLE db_connections ADD COLUMN write_check TEXT NOT NULL DEFAULT 'dangerous';
UPDATE db_connections SET write_check = 'all' WHERE environment = 'staging';
UPDATE db_connections SET write_check = 'env_name' WHERE environment = 'production';
`;

/**
 * v21: CI の結果（GitHub Actions）の失敗の知らせ。プロジェクトごとに知らせるか（ci_watch）と、知らせた実行（同じ実行を起動のたびに知らせ直さない）
 */
const SCHEMA_V21 = `
ALTER TABLE projects ADD COLUMN ci_watch INTEGER NOT NULL DEFAULT 1 CHECK (ci_watch IN (0, 1));
CREATE TABLE ci_failure_notices (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL CHECK (run_id > 0),
  notified_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (project_id, run_id)
) STRICT;
`;

/**
 * v22: ワークツリーの実行環境。ワークツリー（作業するフォルダ）ごとのポートの帯・帯の中の番号の対応・Kickoff が割り当てた組の名前・知らせ。
 * 帯は全プロジェクトで 1 つのワークツリーにだけ渡す（UNIQUE）。プロジェクトを消したら一緒に消え、帯が空く
 */
const SCHEMA_V22 = `
CREATE TABLE worktree_envs (
  path TEXT PRIMARY KEY CHECK (path <> ''),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  band INTEGER UNIQUE CHECK (band IS NULL OR band > 0),
  host TEXT CHECK (host <> ''),
  slots TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(slots) AND json_type(slots) = 'array'),
  compose_names TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(compose_names) AND json_type(compose_names) = 'array'),
  rewritten TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rewritten) AND json_type(rewritten) = 'array'),
  issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues) AND json_type(issues) = 'array'),
  blocked TEXT CHECK (blocked <> ''),
  created_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_worktree_envs_project ON worktree_envs(project_id);
`;

/**
 * v23: ワークツリーの実行環境の段階 2。
 * chats.untracked_only = Git で管理していないファイルだけを書けるチャット（［AI で整える］のチャット。続きの指示でも守る）。
 * db_connections.worktree_path = Docker タブの「DB で開く」で、どのワークツリーの DB から作った接続か（null なら本体・ほか。ワークツリーを消すとき一緒に消せる）
 */
const SCHEMA_V23 = `
ALTER TABLE chats ADD COLUMN untracked_only INTEGER NOT NULL DEFAULT 0 CHECK (untracked_only IN (0, 1));
ALTER TABLE db_connections ADD COLUMN worktree_path TEXT CHECK (worktree_path <> '');
`;

/**
 * v24: スマホ連携の端末（スマホなど、この Mac の Kickoff を外から使う端末）。トークンは hash だけを置く（本物は端末にだけある）。
 * push はプッシュの宛先（Expo のトークン・Web Push の購読。外に出さない）。DB を写して開発版を作ったときは、写した先で空にする（system/devData.ts）
 */
const SCHEMA_V24 = `
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash <> ''),
  push TEXT CHECK (push IS NULL OR (json_valid(push) AND json_type(push) = 'object')),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  last_used_at TEXT
) STRICT;
`;

/** v25: 端末ができること（full = 使える / read = 見るだけ。値の一覧は CHECK にしない） */
const SCHEMA_V25 = `
ALTER TABLE devices ADD COLUMN access TEXT NOT NULL DEFAULT 'full' CHECK (access <> '');
`;

/**
 * v26: Kickoff のゴミ箱（消したものを 3 日だけ取っておき、元に戻せる。メモの仕様書「ファイル削除」）。
 * ファイルの中身はデータのフォルダの trash/<id>/ に置き、ここには元の場所・誰が消したかなどを持つ。id は置き場のフォルダ名（AI の kickoff-trash が付けた uuid も使う）。
 * kind（file / chat / project / session）は値の一覧なので CHECK にしない。chat_id はゴミ箱に入れたチャット（ゴミ箱にある間は行が残る。本当に消すときに一緒に消す）
 */
const SCHEMA_V26 = `
CREATE TABLE trash_items (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind <> ''),
  label TEXT NOT NULL CHECK (label <> ''),
  origin TEXT CHECK (origin <> ''),
  is_dir INTEGER NOT NULL DEFAULT 0 CHECK (is_dir IN (0, 1)),
  size INTEGER CHECK (size IS NULL OR size >= 0),
  chat_id INTEGER,
  by_chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND json_type(details) = 'object'),
  trashed_at TEXT NOT NULL DEFAULT (${NOW})
) STRICT;
CREATE INDEX idx_trash_items_project ON trash_items(project_id, trashed_at);
CREATE INDEX idx_trash_items_trashed ON trash_items(trashed_at);
`;

/**
 * v27: チャット・プロジェクトを Kickoff のゴミ箱に入れる（3 日は元に戻せる。メモの仕様書「ファイル削除」の Q11・Q13・Q20）。
 * ゴミ箱にある間は行を残し、trashed_at（入れた時刻）で一覧・検索などから外す。chats.trashed_with は一緒に入れたゴミ箱の行（trash_items.id。
 * チャットを消したらそのチャットの行、メモを消したらメモの行、プロジェクトを消したらプロジェクトの行）で、戻す・本当に消すときに同じ行のものをまとめて扱う
 */
const SCHEMA_V27 = `
ALTER TABLE chats ADD COLUMN trashed_at TEXT;
ALTER TABLE chats ADD COLUMN trashed_with TEXT CHECK (trashed_with <> '');
CREATE INDEX idx_chats_trashed_with ON chats(trashed_with) WHERE trashed_with IS NOT NULL;
ALTER TABLE projects ADD COLUMN trashed_at TEXT;
`;

const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11, SCHEMA_V12, SCHEMA_V13, SCHEMA_V14, SCHEMA_V15, SCHEMA_V16, SCHEMA_V17, SCHEMA_V18, SCHEMA_V19, SCHEMA_V20, SCHEMA_V21, SCHEMA_V22, SCHEMA_V23, SCHEMA_V24, SCHEMA_V25, SCHEMA_V26, SCHEMA_V27];

/** いまのコードのスキーマの版（いまの系統の何段目か。v1 から） */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * PRAGMA user_version は、この数に版を足して持つ（v1 = 201）。2026-11 の作り直しより前（リリース前）の系統は 100 ＋ 版（101〜）で、
 * その DB は引き継がずに消して作り直す（open.ts の discardPrereleaseData）
 */
export const USER_VERSION_BASE = 200;

/** リリース前の系統の user_version（100 ＋ 版） */
const PRERELEASE_BASE = 100;

const pragmaNumber = (db: DatabaseSync, name: "user_version" | "application_id") =>
  (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];

/** PRAGMA user_version そのもの（作ったばかりなら 0、いまの系統は USER_VERSION_BASE ＋ 版） */
export function userVersion(db: DatabaseSync): number {
  return pragmaNumber(db, "user_version");
}

/** データベースの系統と版。empty: 作ったばかり（空） / current: いまの系統の v<version> / prerelease: リリース前の系統（消して作り直す） */
export type SchemaState = { kind: "empty" } | { kind: "current"; version: number } | { kind: "prerelease" };

/** 開いたデータベースが何かを調べる（読むだけ）。Kickoff のものでない・このアプリより新しい版なら、データに触らずに例外を投げる */
export function inspectSchema(db: DatabaseSync): SchemaState {
  const applicationId = pragmaNumber(db, "application_id");
  const raw = userVersion(db);
  if (applicationId === APPLICATION_ID) {
    if (raw > USER_VERSION_BASE && raw <= USER_VERSION_BASE + SCHEMA_VERSION) return { kind: "current", version: raw - USER_VERSION_BASE };
    if (raw > PRERELEASE_BASE && raw < USER_VERSION_BASE) return { kind: "prerelease" };
  }
  if (applicationId === 0 && raw === 0) {
    const { objects } = db.prepare("SELECT count(*) AS objects FROM sqlite_master").get() as { objects: number };
    if (objects === 0) return { kind: "empty" };
  }
  throw new Error(
    `Kickoff のデータベースではないか、対応していない版のため開けません（application_id = ${applicationId}、user_version = ${raw}）。データには触れていません`,
  );
}

/** いまの系統の版を上げる。版ごとに 1 つのトランザクションで流し、いまの系統の印と user_version（USER_VERSION_BASE ＋ 版）を付ける */
export function migrate(db: DatabaseSync) {
  const state = inspectSchema(db);
  if (state.kind === "prerelease") throw new Error("リリース前の版のデータベースは、消してから作り直します（discardPrereleaseData）");
  for (let v = state.kind === "current" ? state.version : 0; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + v + 1};`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
