// DB クライアントの窓口（ルートから使う）: 接続の登録・秘密の値・作業場所から、つなぐ先（DbTarget）を組み立てて DB ワーカーに頼む。
// 読み取り専用の接続は、文の判定（1 段目）と DB 側の読み取り専用（2 段目）で守る。「書き込む」の間（write）だけ外す
import fs from "node:fs";
import path from "node:path";
import { isReadOnlyStatement, splitStatements } from "@shared/database/sqlStatements";
import type { DbConnection, DbConnectionTestBody, DbConnectionTestResult, DbObjectPath, DbSort, Project } from "@shared/types";
import { DB_NOT_IN_WORKTREE, DB_SQL_MAX_ROWS, DB_TABLE_PAGE_ROWS } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Store } from "../db/store.js";
import { Invalid, NotFound } from "../http/errors.js";
import { expandHome, isInside, realPathLoose } from "../system/paths.js";
import type { DbWorkerClient } from "./client.js";
import type { DbTarget } from "./protocol.js";

/** 作業場所（null なら本体） */
type Workdir = string | null;

interface Options {
  store: Store;
  client: DbWorkerClient;
  /** Kickoff 自身の保存先（この中のファイルは登録させない） */
  dataDir: string;
}

export class DatabaseService {
  /** SQL のタブごとの、流している文を止める口 */
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly opts: Options) {}

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

  /** 接続からつなぐ先を組み立てる（database を指せば、その DB に。PostgreSQL は DB ごとにつなぎ直すため） */
  target(connection: DbConnection, project: Project, workdir: Workdir, opts: { write?: boolean; database?: string | null } = {}): DbTarget {
    return {
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: opts.database ?? connection.database,
      username: connection.username,
      password: this.opts.store.dbConnections.password(connection.id),
      file: connection.engine === "sqlite" && connection.file_path ? this.sqliteFile(connection.file_path, project, workdir) : null,
      ssl: connection.ssl,
      read_only: connection.read_only && !opts.write,
    };
  }

  /** テーブルのタブ・木で共有する接続の名前（接続・作業場所・DB ごとに 1 本） */
  private sharedSession(connection: DbConnection, workdir: Workdir, database: string | null) {
    return `shared:${connection.id}:${workdir ?? "-"}:${database ?? "-"}`;
  }

  private sqlSession(connection: DbConnection, session: string) {
    return `sql:${connection.id}:${session}`;
  }

  /** ワーカーの失敗を「その操作はできない」（400）にする */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Invalid || e instanceof NotFound) throw e;
      throw new Invalid(errorMessage(e));
    }
  }

  /** つながるか試す（保存しない。password を省けば、connection_id の接続の保存したパスワード） */
  async test(project: Project, body: DbConnectionTestBody, workdir: Workdir): Promise<DbConnectionTestResult> {
    const saved = body.connection_id ? this.opts.store.dbConnections.get(body.connection_id) : undefined;
    const password = body.password !== undefined ? body.password : saved && saved.project_id === project.id ? this.opts.store.dbConnections.password(saved.id) : null;
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
      };
    } catch (e) {
      return { ok: false, server_version: null, error: errorMessage(e) };
    }
    try {
      const { server_version } = await this.opts.client.request("test", { target }, { engine: target.engine });
      if (saved) this.opts.store.dbConnections.touchConnected(saved.id);
      return { ok: true, server_version, error: null };
    } catch (e) {
      return { ok: false, server_version: null, error: errorMessage(e) };
    }
  }

  async databases(connection: DbConnection, project: Project, workdir: Workdir) {
    const target = this.target(connection, project, workdir);
    const result = await this.run(() =>
      this.opts.client.request("databases", { session: this.sharedSession(connection, workdir, target.database), target }, { engine: target.engine }),
    );
    this.opts.store.dbConnections.touchConnected(connection.id);
    return result;
  }

  async schemas(connection: DbConnection, project: Project, workdir: Workdir, database: string | null) {
    const target = this.target(connection, project, workdir, { database });
    return this.run(() => this.opts.client.request("schemas", { session: this.sharedSession(connection, workdir, target.database), target, database }, { engine: target.engine }));
  }

  /** 木・テーブルのタブの頼み（場所の DB で共有の接続を選ぶ） */
  private async browse<M extends "objects" | "table" | "definition" | "count" | "outline" | "rows">(
    method: M,
    connection: DbConnection,
    project: Project,
    workdir: Workdir,
    objectPath: DbObjectPath,
    extra: Record<string, unknown>,
  ) {
    // PostgreSQL は DB ごとにつなぐ。ほかは 1 本の接続で DB を名前で指す
    const database = connection.engine === "postgres" ? objectPath.database : null;
    const target = this.target(connection, project, workdir, { database });
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

  rows(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, name: string, sort: DbSort[], offset: number) {
    return this.browse("rows", connection, project, workdir, objectPath, { name, sort, offset, limit: DB_TABLE_PAGE_ROWS });
  }

  count(connection: DbConnection, project: Project, workdir: Workdir, objectPath: DbObjectPath, name: string) {
    return this.browse("count", connection, project, workdir, objectPath, { name });
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
    const target = this.target(connection, project, workdir, { write });
    const session = this.sqlSession(connection, body.session);
    this.running.get(session)?.abort();
    const controller = new AbortController();
    this.running.set(session, controller);
    try {
      return await this.run(() =>
        this.opts.client.request("query", { session, target, sql: body.sql, max_rows: DB_SQL_MAX_ROWS }, { signal: controller.signal, engine: target.engine }),
      );
    } finally {
      if (this.running.get(session) === controller) this.running.delete(session);
    }
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

  /** トランザクションの途中か（SQL のタブを閉じる・切るときの確かめ） */
  inTransaction(connection: DbConnection, session: string) {
    return this.opts.client.isInTransaction(this.sqlSession(connection, session));
  }

  close() {
    for (const c of this.running.values()) c.abort();
    this.opts.client.stop();
  }
}
