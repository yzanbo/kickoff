// 型と定数のみ。Node 依存なし（コア・画面で共有する）
// DB クライアント（プロジェクトの「DB」タブ。プロジェクトごとに DB の接続を登録し、テーブルを見る・SQL を流す）

/** DB の種類（MariaDB は mysql） */
export const DB_ENGINES = ["sqlite", "postgres", "mysql"] as const;
export type DbEngine = (typeof DB_ENGINES)[number];
export const DB_ENGINE_LABELS: Record<DbEngine, string> = { sqlite: "SQLite", postgres: "PostgreSQL", mysql: "MySQL / MariaDB" };
/** 種類ごとの既定のポート（SQLite はファイルなのでなし） */
export const DB_DEFAULT_PORTS: Record<DbEngine, number | null> = { sqlite: null, postgres: 5432, mysql: 3306 };

/** 環境（色・読み取り専用・書き込みの前の確かめ・AI の既定をまとめて決める） */
export const DB_ENVIRONMENTS = ["local", "dev", "staging", "production"] as const;
export type DbEnvironment = (typeof DB_ENVIRONMENTS)[number];
export const DB_ENVIRONMENT_LABELS: Record<DbEnvironment, string> = { local: "ローカル", dev: "開発", staging: "ステージング", production: "本番" };

/** AI に見せるか（チャットの AI の DB のツール。見せない / 承認して見せる / 自由に見せる） */
export const DB_AI_ACCESSES = ["none", "ask", "allow"] as const;
export type DbAiAccess = (typeof DB_AI_ACCESSES)[number];
export const DB_AI_ACCESS_LABELS: Record<DbAiAccess, string> = { none: "見せない", ask: "承認して見せる", allow: "自由に見せる" };

/** 環境ごとの既定（作るときに選んだ環境から埋める。あとで接続ごとに変えられる） */
export const DB_ENVIRONMENT_DEFAULTS: Record<DbEnvironment, { read_only: boolean; ai_access: DbAiAccess }> = {
  local: { read_only: false, ai_access: "allow" },
  dev: { read_only: false, ai_access: "allow" },
  staging: { read_only: false, ai_access: "ask" },
  production: { read_only: true, ai_access: "none" },
};

/** SSL（言葉で選ぶ。off = 使わない / require = 暗号化するが証明書は確かめない / verify = 証明書とホスト名も確かめる） */
export const DB_SSL_MODES = ["off", "require", "verify"] as const;
export type DbSslMode = (typeof DB_SSL_MODES)[number];
export const DB_SSL_MODE_LABELS: Record<DbSslMode, string> = {
  off: "使わない",
  require: "暗号化する（証明書は確かめない）",
  verify: "暗号化して、証明書も確かめる",
};

/** SSL の設定（db_connections.ssl。null = 使わない）。ca_path: 確かめに使う CA の証明書のファイル（null なら OS の証明書） */
export interface DbSsl {
  mode: Exclude<DbSslMode, "off">;
  ca_path: string | null;
}

/** DB の接続（db_connections の表。パスワードは秘密の値に置き、ここには保存したかだけ） */
export interface DbConnection {
  id: number;
  project_id: number;
  name: string;
  engine: DbEngine;
  environment: DbEnvironment;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  /** SQLite のファイル（プロジェクトフォルダからの相対。外のファイルは絶対パス。ワークツリーではその中の同じパスを開く） */
  file_path: string | null;
  ssl: DbSsl | null;
  read_only: boolean;
  ai_access: DbAiAccess;
  /** プロジェクトの中の並び（小さいほど上） */
  position: number;
  /** パスワードを保存したか（値は API に出さない） */
  has_password: boolean;
  /** AI が流す SQL に使う別のユーザー（読み取り専用のユーザーをすすめる。null なら username のまま） */
  ai_username: string | null;
  /** AI 用のユーザーのパスワードを保存したか */
  has_ai_password: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 名前の長さの上限 */
export const DB_CONNECTION_NAME_MAX = 100;

/** 失敗の種類の印: SQLite のファイルが、開いているワークツリーにない（画面は本体のものを開くか聞く） */
export const DB_NOT_IN_WORKTREE = "db_file_not_in_worktree";

// ---- 中身（いつも接続先に聞き、Kickoff には保存しない） ----

/** セルの値（JSON で送れる形。大きな整数は文字列、日時は ISO の文字列、バイナリは大きさと頭の数バイト） */
export type DbValue = string | number | boolean | null | DbBinary;
export interface DbBinary {
  binary: true;
  /** 全体のバイト数 */
  bytes: number;
  /** 頭の 16 バイトまでの 16 進 */
  head: string;
}

/** 結果の列 */
export interface DbColumnInfo {
  name: string;
  /** DB が返す型の名前（分からなければ null） */
  type: string | null;
}

/** 1 つの文の結果 */
export interface DbQueryResult {
  columns: DbColumnInfo[];
  rows: DbValue[][];
  /** 読んだ上限で止めた（もっと行がある） */
  truncated: boolean;
  /** 変えた行の数（INSERT・UPDATE・DELETE など。分からなければ null） */
  affected: number | null;
  duration_ms: number;
  /** この文のあと、トランザクションの途中か（SQL のタブのコミットしていない印） */
  in_transaction: boolean;
}

/** 木の段（接続 → DB → スキーマ → テーブル / ビュー / 関数 / 列挙型） */
export const DB_OBJECT_KINDS = ["table", "view", "function", "enum"] as const;
export type DbObjectKind = (typeof DB_OBJECT_KINDS)[number];
export const DB_OBJECT_KIND_LABELS: Record<DbObjectKind, string> = { table: "テーブル", view: "ビュー", function: "関数", enum: "列挙型" };

/** テーブルのデータの絞り込みの演算子（含む・始まるは大文字と小文字を区別しない） */
export const DB_FILTER_OPS = ["eq", "ne", "lt", "gt", "le", "ge", "contains", "not_contains", "starts", "is_null", "not_null"] as const;
export type DbFilterOp = (typeof DB_FILTER_OPS)[number];
export const DB_FILTER_OP_LABELS: Record<DbFilterOp, string> = {
  eq: "=",
  ne: "≠",
  lt: "<",
  gt: ">",
  le: "≤",
  ge: "≥",
  contains: "含む",
  not_contains: "含まない",
  starts: "で始まる",
  is_null: "NULL",
  not_null: "NULL でない",
};

/** テーブルのデータの絞り込みの条件 1 つ（値は文字列のまま送り、DB に型を合わせてもらう。is_null・not_null は値を使わない） */
export interface DbFilter {
  column: string;
  op: DbFilterOp;
  value: string;
}

/** テーブルのデータの絞り込み（条件をすべて満たす行。where があれば条件の代わりに WHERE の文） */
export interface DbRowFilter {
  filters: DbFilter[];
  where: string | null;
}

/** テーブルなどの場所（PostgreSQL: DB とスキーマ / MySQL: DB（スキーマは DB と同じ）/ SQLite: main など） */
export interface DbObjectPath {
  database: string | null;
  schema: string | null;
}

export interface DbObject {
  kind: DbObjectKind;
  name: string;
}

/** DB の一覧と、どれがいまつないでいるものか（SQLite は main と付け足した DB） */
export interface DbDatabases {
  databases: string[];
  current: string | null;
  /** スキーマの段があるか（PostgreSQL だけ。ほかは DB のすぐ下にテーブル） */
  has_schemas: boolean;
}

export interface DbTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primary_key: boolean;
  comment: string | null;
}

export interface DbIndex {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

export interface DbForeignKey {
  name: string | null;
  columns: string[];
  ref_schema: string | null;
  ref_table: string;
  ref_columns: string[];
  on_update: string | null;
  on_delete: string | null;
}

export interface DbTrigger {
  name: string;
  timing: string | null;
  event: string | null;
}

/** テーブルの構造（テーブルのタブの 構造 / リレーション / DDL / 情報） */
export interface DbTableDetail {
  kind: DbObjectKind;
  columns: DbTableColumn[];
  indexes: DbIndex[];
  foreign_keys: DbForeignKey[];
  /** ほかのテーブルからこのテーブルを指す外部キー（リレーションのタブ） */
  referenced_by: (DbForeignKey & { schema: string | null; table: string })[];
  triggers: DbTrigger[];
  /** 作る文（DB が返せなければ null） */
  ddl: string | null;
  /** 統計の推定の行数（分からなければ null） */
  estimated_rows: number | null;
  /** 大きさ（バイト。分からなければ null） */
  size_bytes: number | null;
  comment: string | null;
}

/** 関数・列挙型の定義（木から開いたタブ。PostgreSQL の関数と列挙型・MySQL / MariaDB のストアドルーチン） */
export interface DbDefinition {
  kind: "function" | "enum";
  /** 関数: 引数（「a integer, b text」）。列挙型・分からなければ null */
  arguments: string | null;
  /** 関数: 戻り値の型（プロシージャ・分からなければ null） */
  returns: string | null;
  /** 列挙型の値（並び順のまま。関数は空） */
  values: string[];
  /** 作る文（DB が返せなければ null） */
  ddl: string | null;
  comment: string | null;
}

/** テーブルのデータの並べ替え（列の見出し。ORDER BY を付けて取り直す） */
export interface DbSort {
  column: string;
  desc: boolean;
}

/** テーブルのタブで読む行の上限 */
export const DB_TABLE_PAGE_ROWS = 100;
/** SQL のタブで読む行の上限 */
export const DB_SQL_MAX_ROWS = 1000;

// ---- SQL の履歴（接続ごとに新しい DB_HISTORY_MAX 件） ----

/** だれが流したか（利用者の SQL のタブ / チャットの AI） */
export const DB_QUERY_RAN_BY = ["user", "ai"] as const;
export type DbQueryRanBy = (typeof DB_QUERY_RAN_BY)[number];

/** 接続ごとに残す履歴の件数 */
export const DB_HISTORY_MAX = 500;

/** SQL の履歴の 1 件（db_query_history） */
export interface DbQueryHistoryEntry {
  id: number;
  connection_id: number;
  sql: string;
  ran_by: DbQueryRanBy;
  /** AI が流したときのチャット（消えたら null） */
  chat_id: number | null;
  /** AI が流したときのチャットの名前（チャットが消えていれば null） */
  chat_title: string | null;
  duration_ms: number | null;
  /** 返した行の数（変えた文は変えた行の数。分からなければ null） */
  row_count: number | null;
  /** 失敗したときの文 */
  error: string | null;
  ran_at: string;
}

/** ER 図: これより多いテーブルの場所では、初めは全体を描かずに選ばせる */
export const DB_ER_AUTO_MAX = 100;
/** ER 図: 1 度に描くテーブルの上限 */
export const DB_ER_MAX = 300;

/** ER 図の 1 つのテーブル（列・外部キー・一意の組。多さの印と制約のない関係の推測に使う） */
export interface DbErTable {
  name: string;
  kind: DbObjectKind;
  comment: string | null;
  columns: { name: string; type: string; nullable: boolean; primary_key: boolean }[];
  foreign_keys: DbForeignKey[];
  /** 一意の列の組（主キー・一意のインデックス。1 対 1 の見分けに使う） */
  unique_sets: string[][];
}

/** ER 図の中身（names: 場所のテーブル・ビューの名前すべて。tables: 描くもの。多すぎて選んでいなければ空） */
export interface DbErSchema {
  names: string[];
  tables: DbErTable[];
}

/** ER 図で動かしたテーブルの位置（テーブル名 → 左上の座標） */
export type DbErPositions = Record<string, { x: number; y: number }>;
