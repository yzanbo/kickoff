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

/**
 * SSH トンネル（db_connections.ssh。null = 使わない）。この Mac の ssh で踏み台につなぎ、DB へのポートを手元に転送する。
 * host は ~/.ssh/config の Host（別名）か、ホスト名。port・user・identity_file は省けば ~/.ssh/config と ssh の既定
 */
export interface DbSsh {
  host: string;
  port: number | null;
  user: string | null;
  /** 秘密鍵のファイル（~ から書ける） */
  identity_file: string | null;
}

/** サーバーの鍵がまだ known_hosts にない（初めてつなぐサーバー。画面で指紋を確かめてから受け入れる） */
export const DB_SSH_UNKNOWN_HOST = "db_ssh_unknown_host";

/** 踏み台のサーバーの鍵（POST …/db-connections/ssh-host-key。指紋は SHA256:…） */
export interface DbSshHostKey {
  /** known_hosts に書く名前（ssh -G で解いたホスト名。22 番でなければ [名前]:ポート） */
  host: string;
  keys: { type: string; fingerprint: string }[];
}

/**
 * つなぐ前の準備のコマンド（db_connections.prep。null = なし）。コマンドはこの Mac のログインシェルで流す。中では
 * {local_port}（Kickoff が選んだ空きポート）・{my_ip}（いまの IP。使うときだけ my_ip_url に聞く）・{host}・{port}・{database}・{user} を使える
 */
export interface DbPrep {
  /** つなぐ前に順に流す（押したときだけ。1 つが失敗したらそこで止める） */
  prepare: string[];
  /** 切るとき（何もしない状態で自動で切れたとき・接続を消したとき・アプリを止めたときも）に流す。準備で開けたものを閉じる */
  cleanup: string[];
  /** ポートを転送するコマンド（流しっぱなしにし、{local_port} につながるまで待つ。切るときに止める）。SSH トンネルとは一緒に使わない */
  tunnel: string | null;
  /** パスワードを取るコマンド（つなぐたびに流し、出力をパスワードにする。保存も表示もしない） */
  password: string | null;
  /** {my_ip} の問い合わせ先（null = DB_MY_IP_URL） */
  my_ip_url: string | null;
}

/** {my_ip} の既定の問い合わせ先 */
export const DB_MY_IP_URL = "https://checkip.amazonaws.com";

/** 準備のコマンドの中身を確かめていない（初めて流す・中身を変えた）。画面が中身を見せて確かめさせる */
export const DB_PREP_UNCONFIRMED = "db_prep_unconfirmed";

/** 準備の記録の種類（準備・後片付け・ポートの転送・パスワードを取る） */
export const DB_PREP_KINDS = ["prepare", "cleanup", "tunnel", "password"] as const;
export type DbPrepKind = (typeof DB_PREP_KINDS)[number];
export const DB_PREP_KIND_LABELS: Record<DbPrepKind, string> = { prepare: "準備", cleanup: "後片付け", tunnel: "ポートの転送", password: "パスワードを取る" };

/** 準備の記録（db_prep_runs。いつ・どのコマンド・成功 / 失敗だけ。出力は残さない） */
export interface DbPrepRun {
  id: number;
  kind: DbPrepKind;
  /** 登録したままのコマンド（{my_ip} などを埋める前） */
  command: string;
  ok: boolean;
  ran_at: string;
}

/** 準備のいまの様子（GET …/:cid/prepare。出力は DB ワーカーのメモリに最後の 1 回分だけ持つ） */
export interface DbPrepState {
  running: boolean;
  steps: { command: string; status: "running" | "ok" | "failed"; output: string }[];
  /** 失敗の文（コマンドの外の失敗: {my_ip} を取れない など） */
  error: string | null;
  finished_at: string | null;
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
  /** SSH トンネル（null = 使わない） */
  ssh: DbSsh | null;
  /** SSH のパスワードを保存したか（鍵・ssh-agent ならなし） */
  has_ssh_password: boolean;
  /** 接続の手順メモ（メモのフォルダからの相対パス。つなぎ方ごとに 1 つで、いくつもの接続で同じでよい。null なら選んでいない） */
  memo_path: string | null;
  /** つなぐ前の準備のコマンド（null = なし） */
  prep: DbPrep | null;
  /** いまの準備のコマンドを利用者が確かめたか（初めて・中身を変えたあとは false。確かめるまで流さない） */
  prep_confirmed: boolean;
  /** 次に確かめる日（YYYY-MM-DD。過ぎたら木の接続の行に印）とひとこと */
  check_on: string | null;
  check_note: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

/** セルの編集で入れる値（文字のまま DB に渡し、型は DB が読み替える。null = NULL） */
export type DbEditValue = string | null;
/** 行を指すキーの値（読んだときの値のまま） */
export type DbKeyValue = string | number | boolean | null;

/**
 * テーブルの行の変更（段階 3 のセルの編集）。更新・削除はキー（主キーか、NULL を許さない一意の列の組）で 1 行を指す。
 * 追加の values にない列は DB の既定値
 */
export type DbRowEdit =
  | { kind: "update"; key: Record<string, DbKeyValue>; values: Record<string, DbEditValue> }
  | { kind: "insert"; values: Record<string, DbEditValue> }
  | { kind: "delete"; key: Record<string, DbKeyValue> };

/** 1 回の保存で送れる変更の数（CSV の取り込みもこの中で） */
export const DB_EDITS_MAX = 10_000;

/** 名前の長さの上限 */
export const DB_CONNECTION_NAME_MAX = 100;

/** プロジェクトから接続を取り込むときに見る所（.env の DATABASE_URL など・docker compose の DB のサービス・Prisma の設定・SQLite のファイル） */
export const DB_IMPORT_SOURCES = ["env", "compose", "prisma", "file"] as const;
export type DbImportSource = (typeof DB_IMPORT_SOURCES)[number];
export const DB_IMPORT_SOURCE_LABELS: Record<DbImportSource, string> = { env: ".env", compose: "docker compose", prisma: "Prisma", file: "SQLite のファイル" };

/** プロジェクトの中で見つけた接続の案（GET …/db-connections/import。パスワードは返さず、あるかだけ） */
export interface DbImportCandidate {
  /** 見つけた所の印（取り込むときに指す。例: env:.env:DATABASE_URL） */
  key: string;
  source: DbImportSource;
  /** 見つけた所の文（「.env の DATABASE_URL」「compose.yaml のサービス db」） */
  origin: string;
  /** 名前の案 */
  name: string;
  engine: DbEngine;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  /** SQLite のファイル（プロジェクトフォルダからの相対） */
  file_path: string | null;
  ssl: DbSsl | null;
  /** 推した環境（ファイルの名前・ホストから。分からない外のホストは本番） */
  environment: DbEnvironment;
  has_password: boolean;
  /** 気をつけること（compose のポートを外に出していない・サービス名を localhost に読み替えた など） */
  note: string | null;
  /** 同じ接続がもう登録してあれば、その接続 */
  existing_id: number | null;
}

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
