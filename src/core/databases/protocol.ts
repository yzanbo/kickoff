// コアと DB ワーカー（別のプロセス）のやり取りの形。コアは頼み（Request）を送り、ワーカーは同じ id の答え（Response）を返す。
// 止めるときは { cancel: id } を送る（SQLite は文を流している間ワーカーが受け取れないので、コアがワーカーごと止める）
import type { DbEditParam } from "@shared/database/dbEdit";
import type { DbPrepVars } from "@shared/database/dbPrep";
import type { DbDatabases, DbDefinition, DbEngine, DbErSchema, DbObject, DbPrepKind, DbPrepState, DbRowFilter, DbObjectPath, DbQueryResult, DbSort, DbSsh, DbSsl, DbTableDetail, DbValue } from "@shared/types";

/** つなぐ先（コアが接続の登録・秘密の値・作業場所から組み立てて、頼みのたびに渡す。ワーカーは保存しない） */
export interface DbTarget {
  engine: DbEngine;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
  password: string | null;
  /** SQLite のファイル（絶対パス） */
  file: string | null;
  ssl: DbSsl | null;
  /** DB 側でも読み取り専用にしてつなぐ（読み取り専用の守りの 2 段目） */
  read_only: boolean;
  /**
   * DB の側の時間の上限（ミリ秒。AI の SQL だけ。PostgreSQL は statement_timeout、MySQL は max_execution_time（SELECT だけ）、MariaDB は max_statement_time。
   * Kickoff の側でも止めるが、ワーカーが落ちても DB の中で流れ続けないように。SQLite は DB の側の上限がないので使わない。null / なし = 付けない）
   */
  timeout_ms?: number | null;
  /** SSH トンネル（null = 使わない。host・port は踏み台から見た DB の場所。password は SSH のパスワード） */
  ssh?: (DbSsh & { password: string | null }) | null;
  /** トンネルを通すときの、証明書を確かめるホスト名（ワーカーが入れる。つなぐ先は 127.0.0.1 になるため） */
  tls_host?: string | null;
  /** つなぐときに流すコマンド（ポートの転送・パスワードを取る。利用者が確かめたものだけをコアが入れる。null = なし） */
  commands?: DbTargetCommands | null;
}

/** つなぐときに流すコマンド（ワーカーがログインシェルで流す） */
export interface DbTargetCommands {
  connection_id: number;
  /** ポートを転送するコマンド（{local_port} につながるまで待ち、使う接続がなくなったら止める） */
  tunnel: string | null;
  /** パスワードを取るコマンド（出力をパスワードにする。保存も表示もしない） */
  password: string | null;
  my_ip_url: string | null;
  /** {host} などに入れる値（{local_port}・{my_ip} はワーカーが入れる） */
  vars: DbPrepVars;
}

/** ワーカーからの知らせ */
export type WorkerEvent = PrepRunEvent | ChildProcessEvent | SessionEvent;

/** ワーカーの中の接続（セッション）を開いた・閉じた（コアが接続ごとに数えて、つないでいるかを画面に知らせる） */
export interface SessionEvent {
  event: "session";
  name: string;
  open: boolean;
}

/** AI の SQL を書き出した結果（rows は頭の行だけ。file は頭の行を超えて CSV に書いたときだけ） */
export interface DbExportResult {
  columns: DbQueryResult["columns"];
  rows: DbValue[][];
  /** すべての行の数 */
  total_rows: number;
  file: string | null;
  affected: number | null;
  duration_ms: number;
}

/**
 * ワーカーが起動した子のプロセス（SSH トンネルの ssh・準備のコマンドのシェル。どれも自分のプロセスグループで起動する）。
 * コアはワーカーを止めるとき、まだ動いている子もグループごと止める（Electron の utilityProcess のワーカーは自分のグループを持てず、
 * ワーカーだけを止めると子が残るため。SQLite の文を流している間のワーカーは JS を動かせないので、ワーカーには片付けさせない）
 */
export interface ChildProcessEvent {
  event: "child";
  pid: number;
  alive: boolean;
}

/** ワーカーから知らせる、流したコマンドの結果（コアが準備の記録に残す。出力は送らない） */
export interface PrepRunEvent {
  event: "prep_run";
  connection_id: number;
  kind: DbPrepKind;
  command: string;
  ok: boolean;
}

/** 補完に使う、スキーマの中のテーブルと列の名前 */
export interface DbOutlineTable {
  name: string;
  columns: string[];
}

/** 接続を使う頼みの共通の項目（session: ワーカーの中の接続の名前。同じ名前なら同じ接続を使い回す） */
interface Session {
  session: string;
  target: DbTarget;
}

/** 頼みの種類 → 引数と答えの形 */
export interface WorkerMethods {
  /** つながるか試す（使い捨ての接続） */
  test: { params: { target: DbTarget }; result: { server_version: string | null } };
  databases: { params: Session; result: DbDatabases };
  schemas: { params: Session & { database: string | null }; result: string[] };
  objects: { params: Session & { path: DbObjectPath }; result: DbObject[] };
  table: { params: Session & { path: DbObjectPath; name: string }; result: DbTableDetail };
  definition: { params: Session & { path: DbObjectPath; kind: "function" | "enum"; name: string }; result: DbDefinition };
  /** ER 図（names: 描くテーブル・ビュー。null なら DB_ER_AUTO_MAX 以下のときだけすべて） */
  er: { params: Session & { path: DbObjectPath; names: string[] | null }; result: DbErSchema };
  /** テーブルの行（長い文字は頭だけ。full なら全体 = 行の詳細で残りを取る） */
  rows: { params: Session & { path: DbObjectPath; name: string; sort: DbSort[]; offset: number; limit: number; filter: DbRowFilter; full?: boolean }; result: DbQueryResult };
  count: { params: Session & { path: DbObjectPath; name: string; filter: DbRowFilter }; result: { count: number } };
  outline: { params: Session & { path: DbObjectPath }; result: DbOutlineTable[] };
  /** 1 つの文を流し、頭の skip 行（省けば 0）を飛ばして max_rows 行まで */
  query: { params: Session & { sql: string; max_rows: number; skip?: number }; result: DbQueryResult };
  /** 1 つの文を流し、頭の head_rows 行を返す。超えたら file に CSV ですべての行を書く（AI の SQL。行の数の上限なし） */
  export: { params: Session & { sql: string; file: string; head_rows: number }; result: DbExportResult };
  /** 文をまとめて 1 つのトランザクションで流す（当たった行の数が expect と違えば、すべて取り消して失敗にする） */
  apply: { params: Session & { statements: { sql: string; params: DbEditParam[]; expect: number | null }[] }; result: { affected: number[]; duration_ms: number } };
  commit: { params: { session: string }; result: { in_transaction: boolean } };
  rollback: { params: { session: string }; result: { in_transaction: boolean } };
  /** 接続を閉じる（途中のトランザクションは取り消す） */
  close: { params: { session: string }; result: { closed: boolean } };
  /** 名前が prefixes のどれかで始まる接続をすべて閉じる（消した接続の木・SQL のタブ・AI の接続。SSH トンネルも使う接続がなくなれば止まる） */
  closeMatching: { params: { prefixes: string[]; cleanup_for?: number }; result: { closed: number } };
  /** 準備のコマンドを順に流し始める（待たずに返す。様子は prepState。済んだら、切るときに cleanup を流す） */
  prepare: { params: { connection_id: number; commands: string[]; cleanup: string[]; vars: DbPrepVars; my_ip_url: string | null }; result: { started: boolean } };
  /** 準備の様子（最後の 1 回分。なければ null） */
  prepState: { params: { connection_id: number }; result: DbPrepState | null };
  /** 流している準備のコマンドを止める */
  prepCancel: { params: { connection_id: number }; result: { cancelled: boolean } };
  /** 止める前の片付け（すべての接続を閉じ、準備した接続の後片付けのコマンドを流す）。idle（使っていないので止める）なら、準備を流している間は何もせず done: false */
  shutdown: { params: { idle?: boolean }; result: { done: boolean } };
}

export type WorkerMethod = keyof WorkerMethods;

export interface WorkerRequest<M extends WorkerMethod = WorkerMethod> {
  id: number;
  method: M;
  params: WorkerMethods[M]["params"];
}

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface WorkerCancel {
  cancel: number;
}
