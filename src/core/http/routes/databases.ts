import type { Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import {
  DB_AI_ACCESSES,
  DB_CONNECTION_NAME_MAX,
  DB_ENGINES,
  DB_ENVIRONMENTS,
  DB_ER_MAX,
  DB_HISTORY_MAX,
  type CopyDbConnectionBody,
  type DbConnection,
  type DbConnectionPatch,
  type DbConnectionTestBody,
  type DbErBody,
  type DbErLayoutBody,
  type DbRowsBody,
  type DbSqlBody,
  type NewDbConnectionBody,
  type Project,
} from "@shared/types";
import type { ServerDeps } from "../server.js";
import { Invalid, NotFound } from "../errors.js";
import { idParam, jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { requireWorktree } from "../workdir.js";

// ---- 入力の形 ----

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const ssl = z.object({ mode: z.enum(["require", "verify"]), ca_path: text(2000) }).nullable();
const connectionShape = {
  name: z.string().trim().min(1).max(DB_CONNECTION_NAME_MAX),
  engine: z.enum(DB_ENGINES),
  environment: z.enum(DB_ENVIRONMENTS),
  host: text(500),
  port: z.number().int().min(1).max(65535).nullable(),
  database: text(500),
  username: text(500),
  file_path: text(2000),
  ssl,
  read_only: z.boolean(),
  ai_access: z.enum(DB_AI_ACCESSES),
  password: z.string().max(10_000).nullable().optional(),
  ai_username: text(500).optional(),
  ai_password: z.string().max(10_000).nullable().optional(),
};
const newConnectionSchema = z.object(connectionShape) satisfies z.ZodType<NewDbConnectionBody, unknown>;
const connectionPatchSchema = z.object(connectionShape).partial() satisfies z.ZodType<DbConnectionPatch, unknown>;
const testSchema = z.object({
  engine: connectionShape.engine,
  environment: connectionShape.environment,
  host: connectionShape.host,
  port: connectionShape.port,
  database: connectionShape.database,
  username: connectionShape.username,
  file_path: connectionShape.file_path,
  ssl,
  password: connectionShape.password,
  connection_id: z.number().int().positive().optional(),
}) satisfies z.ZodType<DbConnectionTestBody, unknown>;
const historyLimit = z.coerce.number().int().min(1).max(DB_HISTORY_MAX).default(200);
const copySchema = z.object({ from_id: z.number().int().positive(), copy_password: z.boolean() }) satisfies z.ZodType<CopyDbConnectionBody>;
const objectPath = z.object({ database: z.string().max(500).nullable(), schema: z.string().max(500).nullable() });
const objectName = z.string().min(1).max(500);
const rowsSchema = z.object({
  path: objectPath,
  table: objectName,
  sort: z.array(z.object({ column: objectName, desc: z.boolean() })).max(10),
  offset: z.number().int().min(0),
}) satisfies z.ZodType<DbRowsBody>;
const erSchema = z.object({ path: objectPath, names: z.array(objectName).max(DB_ER_MAX).nullable() }) satisfies z.ZodType<DbErBody>;
/** ER 図の場所のキー（erPlace の形: DB.スキーマ・main など） */
const erPlace = z.string().min(1).max(1001);
const erPoint = z.object({ x: z.number().finite(), y: z.number().finite() });
/** 位置は描けるテーブルの数の数倍まで（選び直して隠したテーブルの位置も残す） */
const erLayoutSchema = z.object({
  place: erPlace,
  positions: z.record(objectName, erPoint).refine((p) => Object.keys(p).length <= DB_ER_MAX * 10, "位置が多すぎます"),
}) satisfies z.ZodType<DbErLayoutBody>;
/** SQL のタブの接続の名前（画面が作る。英数字・- と _） */
const sessionId = z.string().regex(/^[\w-]{1,64}$/, "SQL のタブの指定が正しくありません");
const sqlSchema = z.object({ session: sessionId, sql: z.string().trim().min(1, "SQL を入れてください").max(1_000_000), write: z.boolean() }) satisfies z.ZodType<DbSqlBody>;

// ---- 接続元の確かめ ----

/** この Mac からの頼みか（127.0.0.1・::1。node-server の受けた接続の相手。テストのように接続がなければ通す） */
function fromThisMac(c: Context) {
  const address = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  return address === undefined || address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * DB クライアント（接続の登録・試す・木・テーブル・SQL）。この Mac からの頼みだけ受ける（LAN は暗号化なしの HTTP で、
 * 読むだけでも DB の中身が流れるため）。変えたら db_connections の知らせ（中身なし）を出し、画面はここから読み直す
 */
export function databaseRoutes(app: Hono, { store, databases }: ServerDeps) {
  const { withProject } = lookups(store);
  const localOnly = createMiddleware(async (c, next) => {
    if (!fromThisMac(c)) return c.json({ error: "DB クライアントは、この Mac からだけ使えます" }, 403);
    await next();
  });
  app.use("/api/projects/:id/db-connections", localOnly);
  app.use("/api/projects/:id/db-connections/*", localOnly);

  /** :cid の接続（このプロジェクトのものでなければ 404） */
  const withConnection = createMiddleware<{ Variables: { project: Project; connection: DbConnection } }>(async (c, next) => {
    const connection = store.dbConnections.get(idParam(c, "cid"));
    if (!connection || connection.project_id !== c.var.project.id) throw new NotFound("DB の接続が見つかりません");
    c.set("connection", connection);
    await next();
  });
  /** ?worktree= の作業場所のフォルダ（なければ本体 = null） */
  const workdirOf = async (c: Context, project: Project) => (await requireWorktree(project.repo_path, queryOf(c, "worktree")))?.path ?? null;
  /** 種類ごとに要る項目の確かめ（SQLite はファイル、ほかはホスト） */
  const checkFields = (project: Project, body: Pick<NewDbConnectionBody, "engine" | "host" | "file_path">) => {
    if (body.engine === "sqlite") {
      if (!body.file_path) throw new Invalid("SQLite のファイルを指定してください");
      databases.checkFile(body.file_path, project);
    } else if (!body.host) throw new Invalid("ホストを指定してください");
  };

  const base = "/api/projects/:id/db-connections";

  app.get(base, withProject, (c) => c.json(store.dbConnections.list(c.var.project.id)));

  app.post(base, withProject, async (c) => {
    const body = newConnectionSchema.parse(await jsonBody(c));
    checkFields(c.var.project, body);
    return c.json(store.dbConnections.create(c.var.project.id, body), 201);
  });

  app.put(`${base}/order`, withProject, async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await jsonBody(c));
    return c.json(store.dbConnections.reorder(c.var.project.id, ids));
  });

  // ほかのプロジェクトの接続を写す（パスワードは選んだときだけ）
  app.post(`${base}/copy`, withProject, async (c) => {
    const { from_id, copy_password } = copySchema.parse(await jsonBody(c));
    const from = store.dbConnections.get(from_id);
    if (!from) throw new NotFound("写す接続が見つかりません");
    const { id: _id, project_id: _p, position: _pos, has_password: _h, has_ai_password: _ha, last_connected_at: _l, created_at: _c, updated_at: _u, ...fields } = from;
    const password = copy_password ? store.dbConnections.password(from.id) : null;
    const ai_password = copy_password ? store.dbConnections.aiPassword(from.id) : null;
    return c.json(store.dbConnections.create(c.var.project.id, { ...fields, password, ai_password }), 201);
  });

  app.post(`${base}/test`, withProject, async (c) => {
    const body = testSchema.parse(await jsonBody(c));
    return c.json(await databases.test(c.var.project, body, await workdirOf(c, c.var.project)));
  });

  app.patch(`${base}/:cid`, withProject, withConnection, async (c) => {
    const patch = connectionPatchSchema.parse(await jsonBody(c));
    const merged = { ...c.var.connection, ...patch };
    checkFields(c.var.project, merged);
    return c.json(store.dbConnections.update(c.var.connection.id, patch));
  });

  app.delete(`${base}/:cid`, withProject, withConnection, (c) => {
    store.dbConnections.delete(c.var.connection.id);
    return c.body(null, 204);
  });

  // ---- 木・テーブル（接続ごとに共有の 1 本） ----

  app.get(`${base}/:cid/databases`, withProject, withConnection, async (c) =>
    c.json(await databases.databases(c.var.connection, c.var.project, await workdirOf(c, c.var.project))),
  );

  app.get(`${base}/:cid/schemas`, withProject, withConnection, async (c) =>
    c.json(await databases.schemas(c.var.connection, c.var.project, await workdirOf(c, c.var.project), queryOf(c, "database") ?? null)),
  );

  app.post(`${base}/:cid/objects`, withProject, withConnection, async (c) => {
    const { path } = z.object({ path: objectPath }).parse(await jsonBody(c));
    return c.json(await databases.objects(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path));
  });

  app.post(`${base}/:cid/table`, withProject, withConnection, async (c) => {
    const { path, name } = z.object({ path: objectPath, name: objectName }).parse(await jsonBody(c));
    return c.json(await databases.table(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path, name));
  });

  app.post(`${base}/:cid/definition`, withProject, withConnection, async (c) => {
    const { path, kind, name } = z.object({ path: objectPath, kind: z.enum(["function", "enum"]), name: objectName }).parse(await jsonBody(c));
    return c.json(await databases.definition(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path, kind, name));
  });

  app.post(`${base}/:cid/rows`, withProject, withConnection, async (c) => {
    const body = rowsSchema.parse(await jsonBody(c));
    return c.json(await databases.rows(c.var.connection, c.var.project, await workdirOf(c, c.var.project), body.path, body.table, body.sort, body.offset));
  });

  app.post(`${base}/:cid/count`, withProject, withConnection, async (c) => {
    const { path, name } = z.object({ path: objectPath, name: objectName }).parse(await jsonBody(c));
    return c.json(await databases.count(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path, name));
  });

  app.post(`${base}/:cid/outline`, withProject, withConnection, async (c) => {
    const { path } = z.object({ path: objectPath }).parse(await jsonBody(c));
    return c.json(await databases.outline(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path));
  });

  // ---- ER 図 ----

  app.post(`${base}/:cid/er`, withProject, withConnection, async (c) => {
    const { path, names } = erSchema.parse(await jsonBody(c));
    return c.json(await databases.er(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path, names));
  });

  // 動かしたテーブルの位置（接続と場所ごと。消すと「自動で並べ直す」）
  app.get(`${base}/:cid/er-layout`, withProject, withConnection, (c) => c.json(store.dbErLayouts.get(c.var.connection.id, erPlace.parse(queryOf(c, "place")))));

  app.put(`${base}/:cid/er-layout`, withProject, withConnection, async (c) => {
    const { place, positions } = erLayoutSchema.parse(await jsonBody(c));
    store.dbErLayouts.set(c.var.connection.id, place, positions);
    return c.body(null, 204);
  });

  app.delete(`${base}/:cid/er-layout`, withProject, withConnection, (c) => {
    store.dbErLayouts.delete(c.var.connection.id, erPlace.parse(queryOf(c, "place")));
    return c.body(null, 204);
  });

  // ---- SQL のタブ（タブごとの接続） ----

  app.post(`${base}/:cid/sql`, withProject, withConnection, async (c) => {
    const body = sqlSchema.parse(await jsonBody(c));
    return c.json(await databases.sql(c.var.connection, c.var.project, await workdirOf(c, c.var.project), body));
  });

  // SQL の履歴（新しい順。AI が流したものは ran_by = ai とチャット）
  app.get(`${base}/:cid/history`, withProject, withConnection, (c) =>
    c.json(databases.history(c.var.connection, historyLimit.parse(queryOf(c, "limit") ?? undefined))),
  );

  app.post(`${base}/:cid/sessions/:session/cancel`, withProject, withConnection, (c) => {
    databases.cancel(c.var.connection, sessionId.parse(c.req.param("session")));
    return c.body(null, 204);
  });

  app.get(`${base}/:cid/sessions/:session`, withProject, withConnection, (c) =>
    c.json({ in_transaction: databases.inTransaction(c.var.connection, sessionId.parse(c.req.param("session"))) }),
  );

  app.post(`${base}/:cid/sessions/:session/commit`, withProject, withConnection, async (c) =>
    c.json(await databases.commit(c.var.connection, sessionId.parse(c.req.param("session")))),
  );

  app.post(`${base}/:cid/sessions/:session/rollback`, withProject, withConnection, async (c) =>
    c.json(await databases.rollback(c.var.connection, sessionId.parse(c.req.param("session")))),
  );

  app.delete(`${base}/:cid/sessions/:session`, withProject, withConnection, async (c) => {
    await databases.closeSession(c.var.connection, sessionId.parse(c.req.param("session")));
    return c.body(null, 204);
  });
}
