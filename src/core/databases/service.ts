// DB クライアントの窓口（ルートから使う）: 接続の登録・秘密の値・作業場所から、つなぐ先（DbTarget）を組み立てて DB ワーカーに頼む。
// 読み取り専用の接続は、文の判定（1 段目）と DB 側の読み取り専用（2 段目）で守る。「書き込む」の間（write）だけ外す
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { editStatements } from "@shared/database/dbEdit";
import { isReadOnlyStatement, splitStatements } from "@shared/database/sqlStatements";
import { hasConnectCommands, normalizePrep, type DbPrepVars } from "@shared/database/dbPrep";
import type { DbConnection, DbConnectionTestBody, DbConnectionTestResult, DbEditsBody, DbEditsResult, DbEngine, DbObjectPath, DbPrep, DbRowFilter, DbSort, Project } from "@shared/types";
import { DB_NOT_IN_WORKTREE, DB_PREP_UNCONFIRMED, DB_SQL_MAX_ROWS, DB_SSH_UNKNOWN_HOST, DB_TABLE_PAGE_ROWS } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Store } from "../db/store.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import { expandHome, isInside, realPathLoose } from "../system/paths.js";
import type { DbWorkerClient } from "./client.js";
import type { DbTarget, DbTargetCommands } from "./protocol.js";
import type { DbSecretVault } from "./secrets.js";
import { AI_EXPORT_KEEP_MS, aiExportFile, aiExportRoot, cleanAiExports, removeChatExports } from "./aiExports.js";
import { DB_AI_MAX_ROWS, DB_AI_TIMEOUT_MS } from "./aiFormat.js";

/** ワーカーの失敗の文の頭の印（「db_ssh_unknown_host: …」）を分ける */
function splitCode(text: string): { message: string; code: string | null } {
  const m = new RegExp(`^(${DB_SSH_UNKNOWN_HOST}): `).exec(text);
  return m ? { message: text.slice(m[0].length), code: m[1] } : { message: text, code: null };
}

/** コマンドの {host}・{port}・{database}・{user} に入れる値 */
const prepVarsOf = (c: Pick<DbConnection, "host" | "port" | "database" | "username">): DbPrepVars => ({
  host: c.host,
  port: c.port === null ? null : String(c.port),
  database: c.database,
  user: c.username,
});

const commandsOf = (connectionId: number, c: Pick<DbConnection, "host" | "port" | "database" | "username">, prep: DbPrep): DbTargetCommands => ({
  connection_id: connectionId,
  tunnel: prep.tunnel,
  password: prep.password,
  my_ip_url: prep.my_ip_url,
  vars: prepVarsOf(c),
});

/** 作業場所（null なら本体） */
type Workdir = string | null;

interface Options {
  store: Store;
  client: DbWorkerClient;
  /** パスワードの暗号化・復号（キーチェーンで開けなければ、その場で入れた値をメモリに持つ） */
  vault: DbSecretVault;
  /** Kickoff 自身の保存先（この中のファイルは登録させない） */
  dataDir: string;
  /** AI の SQL の結果を書き出す CSV の置き場所（省けば OS の一時フォルダの <保存先の名前>-db。テストは一時フォルダの中） */
  exportRoot?: string;
}

/** 片付けの間隔（CSV を書き出すたびに、これより前に片付けていれば片付ける） */
const EXPORT_CLEAN_INTERVAL_MS = 60 * 60_000;

/** 絞り込みの WHERE の文に、文の区切り（2 つ目の文）を入れさせない（式だけを受ける） */
function assertWhere(filter: DbRowFilter, engine: DbEngine) {
  if (filter.where === null || filter.where.trim() === "") return;
  if (splitStatements(`SELECT 1 WHERE ${filter.where}`, engine).length > 1) throw new Invalid("WHERE には式だけを書いてください（; で文を足せません）");
}

/** AI が流せる SQL か（読み取りの 1 文だけ）。承認を聞く前にも確かめる（流せない文を利用者に聞かない） */
export function assertAiSql(sql: string, engine: DbEngine) {
  if (splitStatements(sql, engine).length !== 1) throw new Invalid("1 回に流せるのは 1 つの文だけです");
  if (!isReadOnlyStatement(sql, engine)) throw new Invalid("AI が流せるのは読み取りの文（SELECT・WITH・SHOW・EXPLAIN など）だけです");
}

/** チャットの作業を止めたので AI の SQL も止めたときの文 */
const TURN_STOPPED = "チャットの作業を止めたので、SQL も止めました";

/** 時間の上限で止めたときの文（30 秒なら、延ばして頼み直す方法を AI に伝える） */
function timeoutMessage(minutes: number | null | undefined) {
  if (minutes) return `${minutes} 分を超えたので止めました。`;
  return `${DB_AI_TIMEOUT_MS / 1000} 秒を超えたので止めました。もっと時間がかかる SQL なら、timeout_minutes に流してよい時間（分）を入れてもう一度呼んでください（利用者に承認を聞きます）。`;
}

export class DatabaseService {
  /** パスワードの暗号化・復号（ルートが保存する前に seal する） */
  readonly vault: DbSecretVault;
  /** AI の SQL の結果を書き出す CSV の置き場所 */
  readonly exportRoot: string;
  private exportCleanedAt = 0;
  /** SQL のタブごとの、流している文を止める口 */
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly opts: Options) {
    this.vault = opts.vault;
    this.exportRoot = opts.exportRoot ?? aiExportRoot(opts.dataDir);
    // ワーカーが流したコマンドの結果を準備の記録に残す（消した接続のものは残さない）
    opts.client.onEvent = (event) => {
      if (event.event === "prep_run" && opts.store.dbConnections.get(event.connection_id)) opts.store.dbPrepRuns.add(event.connection_id, event.kind, event.command, event.ok);
    };
  }

  /** Kickoff 自身のデータフォルダの中のファイルか（リンクを解いた実体で比べる） */
  private insideKickoffData(file: string) {
    return isInside(realPathLoose(this.opts.dataDir), realPathLoose(file));
  }

  /**
   * SQLite のファイルの絶対パス（相対ならプロジェクトフォルダから。ワークツリーではその中の同じパス）。
   * ワークツリーになければ 404（code: DB_NOT_IN_WORKTREE）、Kickoff の保存先の中なら 400
   */
  sqliteFile(filePath: string, project: Project, workdir: Workdir): string {
    const expanded = expandHome(filePath);
    const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(workdir ?? project.repo_path, expanded);
    if (this.insideKickoffData(absolute)) throw new Invalid("Kickoff 自身のデータは登録できません");
    if (workdir && !path.isAbsolute(expanded) && !fs.existsSync(absolute)) throw new NotFound(`このワークツリーにはありません（${filePath}）`, DB_NOT_IN_WORKTREE);
    return absolute;
  }

  /** 登録する前の確かめ（SQLite は Kickoff の保存先の中を断る） */
  checkFile(filePath: string | null, project: Project) {
    if (filePath) this.sqliteFile(filePath, project, null);
  }

  /**
   * 接続からつなぐ先を組み立てる（database を指せば、その DB に。PostgreSQL は DB ごとにつなぎ直すため）。
   * ai なら AI 用のユーザー（あれば）でつなぎ、接続の設定によらず DB 側も読み取り専用にする。
   * パスワードはキーチェーンで開く（開けなければ DbPasswordLocked。ほかの確かめを先に済ませ、要らないときに許可を聞かない）
   */
  async target(connection: DbConnection, project: Project, workdir: Workdir, opts: { write?: boolean; database?: string | null; ai?: boolean } = {}): Promise<DbTarget> {
    const file = connection.engine === "sqlite" && connection.file_path ? this.sqliteFile(connection.file_path, project, workdir) : null;
    const commands = this.connectCommands(connection);
    const aiUser = opts.ai && connection.ai_username ? connection.ai_username : null;
    const vault = this.opts.vault;
    const password = await vault.read(connection, aiUser ? "ai_password" : "password");
    const ssh = connection.engine !== "sqlite" && connection.ssh ? { ...connection.ssh, password: await vault.read(connection, "ssh_password") } : null;
    return {
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: opts.database ?? connection.database,
      username: aiUser ?? connection.username,
      password,
      file,
      ssl: connection.ssl,
      read_only: opts.ai ? true : connection.read_only && !opts.write,
      ssh,
      commands,
    };
  }

  /** つなぐときに流すコマンド（ポートの転送・パスワードを取る）。確かめていなければ 409 と DB_PREP_UNCONFIRMED（画面が中身を見せて確かめさせる） */
  private connectCommands(connection: DbConnection): DbTargetCommands | null {
    if (connection.engine === "sqlite" || !hasConnectCommands(connection.prep)) return null;
    if (!connection.prep_confirmed) {
      throw new Conflict(`「${connection.name}」はつなぐときにコマンドを流します。流す前に、コマンドの中身を確かめてください`, DB_PREP_UNCONFIRMED);
    }
    return commandsOf(connection.id, connection, connection.prep!);
  }

  /** 準備のコマンドを流し始める（確かめていなければ 409。様子は prepState） */
  async prepare(connection: DbConnection) {
    if (!connection.prep || connection.prep.prepare.length === 0) throw new Invalid("この接続には準備のコマンドがありません");
    if (!connection.prep_confirmed) throw new Conflict("準備のコマンドを流す前に、中身を確かめてください", DB_PREP_UNCONFIRMED);
    return this.run(() =>
      this.opts.client.request("prepare", {
        connection_id: connection.id,
        commands: connection.prep!.prepare,
        cleanup: connection.prep!.cleanup,
        vars: prepVarsOf(connection),
        my_ip_url: connection.prep!.my_ip_url,
      }),
    );
  }

  /** 準備の様子（ワーカーが止まっていれば null） */
  async prepState(connection: DbConnection) {
    if (!this.opts.client.running) return null;
    return this.opts.client.request("prepState", { connection_id: connection.id });
  }

  async prepCancel(connection: DbConnection) {
    if (!this.opts.client.running) return;
    await this.opts.client.request("prepCancel", { connection_id: connection.id });
  }

  /** テーブルのタブ・木で共有する接続の名前（接続・作業場所・DB ごとに 1 本） */
  private sharedSession(connection: DbConnection, workdir: Workdir, database: string | null) {
    return `shared:${connection.id}:${workdir ?? "-"}:${database ?? "-"}`;
  }

  private sqlSession(connection: DbConnection, session: string) {
    return `sql:${connection.id}:${session}`;
  }

  /** ワーカーの失敗を「その操作はできない」（400）にする（初めての SSH のサーバーは 409 と印 DB_SSH_UNKNOWN_HOST。画面が鍵を確かめさせる） */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Invalid || e instanceof NotFound || e instanceof Conflict) throw e;
      const { message, code } = splitCode(errorMessage(e));
      if (code) throw new Conflict(message, code);
      throw new Invalid(message);
    }
  }

  /** つながるか試す（保存しない。password を省けば、connection_id の接続の保存したパスワード） */
  async test(project: Project, body: DbConnectionTestBody, workdir: Workdir): Promise<DbConnectionTestResult> {
    const saved = body.connection_id ? this.opts.store.dbConnections.get(body.connection_id) : undefined;
    const own = saved && saved.project_id === project.id ? saved : undefined;
    const password = body.password !== undefined ? body.password : own ? await this.opts.vault.read(own, "password") : null;
    const sshPassword = body.ssh_password !== undefined ? body.ssh_password : own ? await this.opts.vault.read(own, "ssh_password") : null;
    const ssh = body.ssh === undefined ? (own?.ssh ?? null) : body.ssh;
    const prep = normalizePrep(body.prep === undefined ? (own?.prep ?? null) : body.prep);
    let target: DbTarget;
    try {
      target = {
        engine: body.engine,
        host: body.host,
        port: body.port,
        database: body.database,
        username: body.username,
        password,
        file: body.engine === "sqlite" && body.file_path ? this.sqliteFile(body.file_path, project, workdir) : null,
        ssl: body.ssl,
        read_only: true,
        ssh: body.engine !== "sqlite" && ssh ? { ...ssh, password: sshPassword } : null,
        // 接続のダイアログで見えているコマンドを、利用者が「つながるか試す」を押して流すので、確かめ済みかは問わない
        commands: body.engine !== "sqlite" && hasConnectCommands(prep) ? commandsOf(own?.id ?? 0, body, prep!) : null,
      };
    } catch (e) {
      return { ok: false, server_version: null, error: errorMessage(e) };
    }
    try {
      const { server_version } = await this.opts.client.request("test", { target }, { engine: target.engine });
      if (saved) this.opts.store.dbConnections.touchConnected(saved.id);
      return { ok: true, server_version, error: null };
    } catch (e) {
      const { message, code } = splitCode(errorMessage(e));
      return { ok: false, server_version: null, error: message, ...(code ? { code } : {}) };
    }
  }

  async databases(connection: DbConnection, project: Project, workdir: Workdir) {
    const target = await this.target(connection, project, workdir);
    const result = await this.run(() =>
      this.opts.client.request("databases", { session: this.sharedSession(connection, workdir, target.database), target }, { engine: target.engine }),
    );
    this.opts.store.dbConnections.touchConnected(connection.id);
    return result;
  }

  async schemas(connection: DbConnection, project: Project, workdir: Workdir, database: string | null) {
    const target = await this.target(connection, project, workdir, { database });
    return this.run(() => this.opts.client.request("schemas", { session: this.sharedSession(connection, workdir, target.database), target, database }, { engine: target.engine }));
  }

  /** 木・テーブルのタブの頼み（場所の DB で共有の接続を選ぶ） */
  private async browse<M extends "objects" | "table" | "definition" | "er" | "count" | "outline" | "rows">(
    method: M,
    connection: DbConnection,
    project: Project,
    workdir: Workdir,
    objectPath: DbObjectPath,
    extra: Record<string, unknown>,
  ) {
    // PostgreSQL は DB ごとにつなぐ。ほかは 1 本の接続で DB を名前で指す
    const database = connection.engine === "postgres" ? objectPath.database : null;
    const target = await this.target(connection, project, workdir, { database });
    const session = this.sharedSession(connection, workdir, target.database);
    return this.run(() => this.opts.client.request(method, { session, target, path: objectPath, ...extra } as never, { engine: target.engine }));
  }

  objects(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath) {
    return this.browse("objects", connection, project, workdir, objectPath, {});
  }

  table(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, name: string) {
    return this.browse("table", connection, project, workdir, objectPath, { name });
  }

  /** 関数・列挙型の定義（木から開いたタブ） */
  definition(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, kind: "function" | "enum", name: string) {
    return this.browse("definition", connection, project, workdir, objectPath, { kind, name });
  }

  /** ER 図の中身（names: 描くテーブル。null なら多すぎなければすべて） */
  er(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, names: string[] | null) {
    return this.browse("er", connection, project, workdir, objectPath, { names });
  }

  /** テーブルの行（絞り込みの WHERE の文は 1 文の中の式だけ。2 つ目の文を足させない） */
  rows(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, name: string, sort: DbSort[], offset: number, filter: DbRowFilter) {
    assertWhere(filter, connection.engine);
    return this.browse("rows", connection, project, workdir, objectPath, { name, sort, offset, limit: DB_TABLE_PAGE_ROWS, filter });
  }

  count(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, name: string, filter: DbRowFilter) {
    assertWhere(filter, connection.engine);
    return this.browse("count", connection, project, workdir, objectPath, { name, filter });
  }

  outline(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath) {
    return this.browse("outline", connection, project, workdir, objectPath, {});
  }

  /**
   * SQL のタブで 1 つの文を流す（タブごとの接続。読み取り専用の接続で書く文は、「書き込む」の間でなければ流す前に断る）。
   * 時間の上限は付けず、止める（cancel）まで待つ
   */
  async sql(connection: DbConnection, project: Project, workdir: Workdir, body: { session: string; sql: string; write: boolean }) {
    const write = body.write;
    // DB によっては 2 つ目からの文を黙って捨てるので、1 回に 1 つだけにする（画面が文に分けて 1 つずつ送る）
    if (splitStatements(body.sql, connection.engine).length > 1) throw new Invalid("1 回に流せるのは 1 つの文だけです");
    if (connection.read_only && !write && !isReadOnlyStatement(body.sql, connection.engine)) {
      throw new Invalid("読み取り専用の接続なので、書き込む文は流せません（書くときは SQL のタブの「書き込む」を押してください）");
    }
    const target = await this.target(connection, project, workdir, { write });
    const session = this.sqlSession(connection, body.session);
    this.running.get(session)?.abort();
    const controller = new AbortController();
    this.running.set(session, controller);
    const started = Date.now();
    // 流した文は成功・失敗とも SQL の履歴に残す（判定で断った文は流していないので残さない）
    const record = (entry: { duration_ms: number; row_count?: number | null; error?: string }) =>
      this.opts.store.dbQueryHistory.add({ connection_id: connection.id, sql: body.sql, ran_by: "user", chat_id: null, ...entry });
    try {
      const result = await this.run(() =>
        this.opts.client.request("query", { session, target, sql: body.sql, max_rows: DB_SQL_MAX_ROWS }, { signal: controller.signal, engine: target.engine }),
      );
      record({ duration_ms: result.duration_ms, row_count: result.columns.length > 0 ? result.rows.length : result.affected });
      return result;
    } catch (e) {
      record({ duration_ms: Date.now() - started, error: controller.signal.aborted ? "止めました" : errorMessage(e) });
      throw e;
    } finally {
      if (this.running.get(session) === controller) this.running.delete(session);
    }
  }

  /**
   * テーブルの行の変更をまとめて保存する（段階 3 のセルの編集・行の追加と削除・CSV の取り込み）。SQL は画面から受けずに
   * 変更の形から組み立て（@shared/database/dbEdit）、新しい接続の 1 つのトランザクションで流す（更新・削除がちょうど 1 行に当たらなければ、
   * すべて取り消す）。読み取り専用の接続は「書き込む」の間（write）だけ。流した文は SQL の履歴に 1 件で残す
   */
  async applyEdits(connection: DbConnection, project: Project, workdir: Workdir, body: DbEditsBody): Promise<DbEditsResult> {
    if (connection.read_only && !body.write) throw new Invalid("読み取り専用の接続なので保存できません（テーブルのタブの「書き込む」を押してから保存してください）");
    const statements = editStatements(connection.engine, body.path, body.table, body.edits);
    if (statements.length === 0) return { affected: [], duration_ms: 0 };
    const target = await this.target(connection, project, workdir, { write: body.write, database: connection.engine === "postgres" ? body.path.database : null });
    const session = `edit:${connection.id}:${randomUUID()}`;
    const sql = statements.map((s) => `${s.preview};`).join("\n");
    const started = Date.now();
    try {
      const result = await this.run(() =>
        this.opts.client.request("apply", { session, target, statements: statements.map(({ sql, params, expect }) => ({ sql, params, expect })) }, { engine: target.engine }),
      );
      this.opts.store.dbQueryHistory.add({ connection_id: connection.id, sql, ran_by: "user", chat_id: null, duration_ms: result.duration_ms, row_count: result.affected.reduce((a, b) => a + b, 0) });
      return result;
    } catch (e) {
      this.opts.store.dbQueryHistory.add({ connection_id: connection.id, sql, ran_by: "user", chat_id: null, duration_ms: Date.now() - started, error: errorMessage(e) });
      throw e;
    } finally {
      if (this.opts.client.running) await this.opts.client.request("close", { session }).catch(() => {});
    }
  }

  /**
   * チャットの AI が流す SQL（読み取りの 1 文だけ）。守りは 4 段: 文の判定・DB 側の読み取り専用・呼び出しごとの新しい接続（SET などの状態を残さない）・
   * AI 用のユーザー（あれば）。DB_AI_TIMEOUT_MS（30 秒）を超えたら止める（timeoutMinutes があればその分。利用者が承認したときだけ渡る）。
   * チャットの作業を止めたら（signal）SQL も止める。DB_AI_MAX_ROWS 行を超える結果は、すべての行を CSV に書き出して場所を返す。結果は履歴に AI の印で残す
   */
  async aiQuery(
    connection: DbConnection,
    project: Project,
    workdir: Workdir,
    input: { sql: string; database: string | null; chatId: number; timeoutMinutes?: number | null; signal?: AbortSignal },
  ) {
    assertAiSql(input.sql, connection.engine);
    // 承認を待つ間にチャットの作業を止めていたら流さない
    if (input.signal?.aborted) throw new Invalid(TURN_STOPPED);
    const target = await this.target(connection, project, workdir, { database: connection.engine === "postgres" ? input.database : null, ai: true });
    const session = `ai:${connection.id}:${randomUUID()}`;
    const controller = new AbortController();
    const limitMs = input.timeoutMinutes ? input.timeoutMinutes * 60_000 : DB_AI_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limitMs);
    const stopTurn = () => controller.abort();
    input.signal?.addEventListener("abort", stopTurn, { once: true });
    const started = Date.now();
    // MySQL は DB を名前で指すので、指されたら先に切り替える（同じ接続の中だけ。終わったら閉じる）
    const sql = input.sql;
    try {
      if (connection.engine === "mysql" && input.database) {
        await this.opts.client.request("query", { session, target, sql: `USE \`${input.database.replaceAll("`", "``")}\``, max_rows: 1 }, { signal: controller.signal, engine: target.engine });
      }
      const file = aiExportFile(this.exportRoot, input.chatId, connection.name);
      const result = await this.opts.client.request("export", { session, target, sql, file, head_rows: DB_AI_MAX_ROWS }, { signal: controller.signal, engine: target.engine });
      this.opts.store.dbQueryHistory.add({ connection_id: connection.id, sql, ran_by: "ai", chat_id: input.chatId, duration_ms: result.duration_ms, row_count: result.columns.length > 0 ? result.total_rows : result.affected });
      this.opts.store.dbConnections.touchConnected(connection.id);
      if (result.file) this.cleanExportsSometimes();
      return result;
    } catch (e) {
      const error = timedOut ? timeoutMessage(input.timeoutMinutes) : controller.signal.aborted ? TURN_STOPPED : errorMessage(e);
      this.opts.store.dbQueryHistory.add({ connection_id: connection.id, sql, ran_by: "ai", chat_id: input.chatId, duration_ms: Date.now() - started, error });
      throw new Invalid(error);
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", stopTurn);
      if (this.opts.client.running) await this.opts.client.request("close", { session }).catch(() => {});
    }
  }

  /** AI の SQL の CSV を片付ける（7 日を過ぎたもの・もうないチャットのもの。起動のときと、書き出したときに 1 時間ごと） */
  cleanExports(now = Date.now()) {
    this.exportCleanedAt = now;
    try {
      cleanAiExports(this.exportRoot, (chatId) => this.opts.store.chats.get(chatId) !== undefined, now, AI_EXPORT_KEEP_MS);
    } catch (e) {
      console.warn(`[databases] AI の SQL の CSV を片付けられませんでした: ${errorMessage(e)}`);
    }
  }

  private cleanExportsSometimes() {
    if (Date.now() - this.exportCleanedAt > EXPORT_CLEAN_INTERVAL_MS) this.cleanExports();
  }

  /** チャットを消したら、そのチャットの CSV も消す */
  forgetChatExports(chatIds: number[]) {
    for (const id of chatIds) removeChatExports(this.exportRoot, id);
  }

  /** SQL の履歴（新しい順） */
  history(connection: DbConnection, limit: number) {
    return this.opts.store.dbQueryHistory.list(connection.id, limit);
  }

  /** SQL のタブで流している文を止める（流していなければ何もしない） */
  cancel(connection: DbConnection, session: string) {
    this.running.get(this.sqlSession(connection, session))?.abort();
  }

  commit(connection: DbConnection, session: string) {
    return this.run(() => this.opts.client.request("commit", { session: this.sqlSession(connection, session) }));
  }

  rollback(connection: DbConnection, session: string) {
    return this.run(() => this.opts.client.request("rollback", { session: this.sqlSession(connection, session) }));
  }

  /** SQL のタブを閉じる（途中のトランザクションは取り消す） */
  async closeSession(connection: DbConnection, session: string) {
    if (!this.opts.client.running) return;
    await this.run(() => this.opts.client.request("close", { session: this.sqlSession(connection, session) }));
  }

  /** 消した接続のワーカーの接続（木・SQL のタブ・AI）をすべて閉じる（SSH トンネルも残さない） */
  async forgetConnection(id: number) {
    if (!this.opts.client.running) return;
    await this.opts.client.request("closeMatching", { prefixes: ["shared", "sql", "ai"].map((kind) => `${kind}:${id}:`), cleanup_for: id });
  }

  /** トランザクションの途中か（SQL のタブを閉じる・切るときの確かめ） */
  inTransaction(connection: DbConnection, session: string) {
    return this.opts.client.isInTransaction(this.sqlSession(connection, session));
  }

  /** 止める（準備した接続の後片付けのコマンドを流してから） */
  async close() {
    for (const c of this.running.values()) c.abort();
    await this.opts.client.shutdown();
  }
}
