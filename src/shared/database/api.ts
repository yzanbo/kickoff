// DB クライアントの HTTP の本文と応答の形（コアのルートの zod と画面の呼び手が同じものを使う。型のみ）
import type { DbAiAccess, DbColumnInfo, DbEndpoint, DbEnvironment, DbErPositions, DbFilter, DbObjectPath, DbPrep, DbRowEdit, DbRowFilter, DbSort, DbSsh, DbValue, DbWriteCheck } from "./types";

/**
 * DB の接続を作る（POST /api/projects/:id/db-connections）。SQLite は file_path、ほかは host・port・database・username。
 * password: 保存するパスワード（省く・null なら保存しない。値は二度と API に出さない）
 */
export interface NewDbConnectionBody extends DbEndpoint {
  name: string;
  environment: DbEnvironment;
  read_only: boolean;
  /** 書き込む前の確かめ（作るときに省けば環境の既定） */
  write_check?: DbWriteCheck;
  ai_access: DbAiAccess;
  password?: string | null;
  /** AI が流す SQL に使う別のユーザー（null なら username のまま） */
  ai_username?: string | null;
  /** AI 用のユーザーのパスワード（password と同じく、省けばそのまま・null で消す） */
  ai_password?: string | null;
  /** 接続の手順ノート（ノートのフォルダからの相対パス。null で外す） */
  note_path?: string | null;
  /** SSH トンネル（省けばそのまま・null で使わない） */
  ssh?: DbSsh | null;
  /** SSH のパスワード（password と同じく、省けばそのまま・null で消す） */
  ssh_password?: string | null;
  /** つなぐ前の準備のコマンド（省けばそのまま・null でなし。中身を変えたら確かめ直す） */
  prep?: DbPrep | null;
  /** 次に確かめる日（YYYY-MM-DD）とひとこと */
  check_on?: string | null;
  check_note?: string | null;
}

/** DB の接続を変える（PATCH …/db-connections/:cid。書いた項目だけ。password: 省けばそのまま・null で消す・文字列で替える） */
export type DbConnectionPatch = Partial<NewDbConnectionBody>;

/**
 * つながるか試す（POST …/db-connections/test。保存しない）。connection_id があれば、password を省いたときにその接続の保存したパスワードを使う
 */
export type DbConnectionTestBody = DbEndpoint & Pick<NewDbConnectionBody, "environment" | "password" | "ssh" | "ssh_password" | "prep"> & { connection_id?: number };

/**
 * 踏み台のサーバーの鍵を見る（POST …/db-connections/ssh-host-key）・受け入れて ~/.ssh/known_hosts に足す（…/ssh-host-key/accept。
 * fingerprints は画面で見せた指紋。読み直した鍵と合わなければ足さない）
 */
export interface DbSshHostKeyBody {
  ssh: DbSsh;
  fingerprints?: string[];
}

/** つながるか試した結果 */
export interface DbConnectionTestResult {
  ok: boolean;
  /** つながったときの DB の版（分かれば） */
  server_version: string | null;
  error: string | null;
  /** 失敗の印（初めての SSH のサーバーなら DB_SSH_UNKNOWN_HOST。画面が鍵を確かめさせる） */
  code?: string;
  /** つなぐのにかかった時間（SSH・準備のコマンドを含む。つなぐ前に断ったときは null） */
  duration_ms: number | null;
}

/** ほかのプロジェクトの接続を写す（POST …/db-connections/copy）。copy_password が false ならパスワードは写さない */
export interface CopyDbConnectionBody {
  from_id: number;
  copy_password: boolean;
}

/** プロジェクトから見つけた接続を取り込む（POST …/db-connections/import。パスワードはコアが見つけた所から読み直す） */
export interface DbImportBody {
  items: { key: string; name: string; environment: DbEnvironment }[];
}

/** テーブルの行を読む（POST …/db-connections/:cid/rows。DB_TABLE_PAGE_ROWS 行まで） */
export interface DbRowsBody {
  path: DbObjectPath;
  table: string;
  sort: DbSort[];
  offset: number;
  /** 絞り込み（省くと絞らない） */
  filter?: DbRowFilter;
}

/** 接続を切った結果（POST …/db-connections/:cid/disconnect。本文 { force }）。コミットしていない SQL のタブがあって force でなければ切らない */
export interface DbDisconnectResult {
  disconnected: boolean;
  /** トランザクションの途中だった SQL のタブ（セッションの名前 = タブのキー。force なら取り消した） */
  pending_sessions: string[];
}

/** SQL のタブの「AI に頼む」（POST …/db-connections/:cid/sql-assist）。path の場所のテーブルと列の名前・いまの SQL・頼みから、AI に 1 回だけ SQL を書いてもらう */
export interface DbSqlAssistBody {
  path: DbObjectPath;
  request: string;
  /** いま入力欄にある SQL（空でよい） */
  sql: string;
}

export interface DbSqlAssistResult {
  sql: string;
}

/** つないでいる接続（GET …/db-connections/connected。木・テーブル・SQL のタブの接続が開いているもの） */
export interface DbConnectedIds {
  ids: number[];
}

/** テーブルの 1 行を全体のまま読む（POST …/db-connections/:cid/full-row。行の詳細で、頭だけ送った長い文字の残りを取る）。filters は行を指すキーの列の条件 */
export interface DbFullRowBody {
  path: DbObjectPath;
  table: string;
  filters: DbFilter[];
}

/** テーブルの 1 行（長い文字も全体のまま。バイナリは大きさと頭のまま） */
export interface DbFullRow {
  columns: DbColumnInfo[];
  row: DbValue[];
}

/** ER 図の中身を読む（POST …/db-connections/:cid/er）。names: 描くテーブル・ビュー（null なら DB_ER_AUTO_MAX 以下のときだけすべて） */
export interface DbErBody {
  path: DbObjectPath;
  names: string[] | null;
}

/** ER 図で動かしたテーブルの位置を覚える（PUT …/db-connections/:cid/er-layout）。scope: DB の場所のキー（erPlace） */
export interface DbErLayoutBody {
  scope: string;
  positions: DbErPositions;
}

/** テーブルの行の変更をまとめて保存する（1 つのトランザクション。更新・削除がちょうど 1 行に当たらなければ、すべて取り消す） */
export interface DbEditsBody {
  path: DbObjectPath;
  table: string;
  edits: DbRowEdit[];
  /** 読み取り専用の接続で「書き込む」の間（読み取り専用でない接続は false でよい） */
  write: boolean;
}

/** 保存の結果（変更ごとに変えた行の数） */
export interface DbEditsResult {
  affected: number[];
  duration_ms: number;
}

/** 保存したパスワードをキーチェーンで開けなかったときに、利用者が入れたパスワード（入れた種類だけ。Kickoff を終えるまでコアのメモリにだけ持つ） */
export interface DbEnteredPasswordsBody {
  password?: string;
  ai_password?: string;
  ssh_password?: string;
}

/** SQL のタブで 1 つの文を流す（POST …/db-connections/:cid/sql）。session: SQL のタブごとの接続の ID。write: 「書き込む」の間（読み取り専用を外す） */
export interface DbSqlBody {
  session: string;
  sql: string;
  write: boolean;
  /** 「さらに読む」: 頭のこの行数を飛ばして続きを読む（読み取りの文だけ。流し直すので履歴には残さない。省けば 0） */
  offset?: number;
}
