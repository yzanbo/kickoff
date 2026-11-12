import type { Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import {
  DB_AI_ACCESSES,
  DB_ENVIRONMENT_DEFAULTS,
  DB_WRITE_CHECKS,
  DB_CONNECTION_NAME_MAX,
  DB_ENGINES,
  DB_ENVIRONMENTS,
  DB_EDITS_MAX,
  DB_ER_MAX,
  DB_FILTER_OPS,
  DB_HISTORY_MAX,
  type CopyDbConnectionBody,
  type DbConnection,
  type DbConnectionPatch,
  type DbConnectionTestBody,
  type DbEditsBody,
  type DbEnteredPasswordsBody,
  type DbErBody,
  type DbErLayoutBody,
  type DbImportBody,
  type DbRowFilter,
  type DbRowsBody,
  type DbFullRowBody,
  type DbSqlBody,
  type DbSshHostKeyBody,
  type NewDbConnectionBody,
  type Project,
} from "@shared/types";
import type { ServerDeps } from "../server.js";
import { localOnly } from "../thisMac.js";
import { Invalid, NotFound } from "../errors.js";
import { idParam, jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { requireWorktree } from "../workdir.js";
import { scanProjectDbs, toImportCandidates } from "../../databases/import/index.js";
import { acceptSshHostKey, scanSshHostKey, sshConfigHosts } from "../../databases/sshHostKey.js";

// ---- 入力の形 ----

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const ssl = z.object({ mode: z.enum(["require", "verify"]), ca_path: text(2000) }).nullable();
/** SSH トンネル（ホストは ~/.ssh/config の Host かホスト名。「-」で始まるものは ssh のオプションと取り違えるので断る） */
const sshHost = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((v) => !v.startsWith("-") && !/\s/.test(v), "SSH のホストの形が正しくありません");
const ssh = z
  .object({
    host: sshHost,
    port: z.number().int().min(1).max(65535).nullable(),
    user: text(200).refine((v) => v === null || !v.startsWith("-"), "SSH のユーザーの形が正しくありません"),
    identity_file: text(2000),
  })
  .nullable();
/** コマンド 1 つ（1 行。改行は入れない） */
const command = z.string().max(4000).refine((v) => !/[\r\n]/.test(v), "コマンドは 1 行に 1 つにしてください");
/** つなぐ前の準備のコマンド（各 20 個まで） */
const prep = z
  .object({
    prepare: z.array(command).max(20),
    cleanup: z.array(command).max(20),
    tunnel: command.nullable(),
    password: command.nullable(),
    my_ip_url: z.string().trim().max(500).regex(/^https?:\/\//, "{my_ip} の問い合わせ先は http(s):// の URL にしてください").nullable(),
  })
  .nullable();
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
  write_check: z.enum(DB_WRITE_CHECKS).optional(),
  ai_access: z.enum(DB_AI_ACCESSES),
  password: z.string().max(10_000).nullable().optional(),
  ai_username: text(500).optional(),
  ai_password: z.string().max(10_000).nullable().optional(),
  // 手順メモ: メモのフォルダからの相対パス（/ で始まる・.. を含むものは断る）
  memo_path: text(1000)
    .refine((v) => v === null || (!v.startsWith("/") && !v.split("/").includes("..")), "手順メモはメモのフォルダの中のメモを選んでください")
    .optional(),
  ssh: ssh.optional(),
  ssh_password: z.string().max(10_000).nullable().optional(),
  prep: prep.optional(),
  check_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD で書いてください").nullable().optional(),
  check_note: text(200).optional(),
};
const newConnectionSchema = z.object(connectionShape) satisfies z.ZodType<NewDbConnectionBody, unknown>;
const connectionPatchSchema = z.object(connectionShape).partial() satisfies z.ZodType<DbConnectionPatch, unknown>;
const enteredPassword = z.string().min(1).max(10_000).optional();
const enteredPasswordsSchema = z.object({ password: enteredPassword, ai_password: enteredPassword, ssh_password: enteredPassword }) satisfies z.ZodType<DbEnteredPasswordsBody>;

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
  ssh: ssh.optional(),
  ssh_password: connectionShape.ssh_password,
  prep: prep.optional(),
  connection_id: z.number().int().positive().optional(),
}) satisfies z.ZodType<DbConnectionTestBody, unknown>;
const hostKeySchema = z.object({
  ssh: ssh.unwrap(),
  fingerprints: z.array(z.string().max(200)).max(20).optional(),
}) satisfies z.ZodType<DbSshHostKeyBody, unknown>;
const historyLimit = z.coerce.number().int().min(1).max(DB_HISTORY_MAX).default(200);
const importSchema = z.object({
  items: z
    .array(z.object({ key: z.string().min(1).max(3000), name: connectionShape.name, environment: connectionShape.environment }))
    .min(1)
    .max(50),
}) satisfies z.ZodType<DbImportBody, unknown>;
const copySchema = z.object({ from_id: z.number().int().positive(), copy_password: z.boolean() }) satisfies z.ZodType<CopyDbConnectionBody>;
const objectPath = z.object({ database: z.string().max(500).nullable(), schema: z.string().max(500).nullable() });
const objectName = z.string().min(1).max(500);
/** 絞り込み（条件は 20 個まで・WHERE の文は 1 万文字まで） */
const rowFilter = z.object({
  filters: z.array(z.object({ column: objectName, op: z.enum(DB_FILTER_OPS), value: z.string().max(10_000) })).max(20),
  where: z.string().max(10_000).nullable(),
}) satisfies z.ZodType<DbRowFilter>;
const noFilter: DbRowFilter = { filters: [], where: null };
const rowsSchema = z.object({
  path: objectPath,
  table: objectName,
  filter: rowFilter.default(noFilter),
  sort: z.array(z.object({ column: objectName, desc: z.boolean() })).max(10),
  offset: z.number().int().min(0),
}) satisfies z.ZodType<DbRowsBody>;
const fullRowSchema = z.object({ path: objectPath, table: objectName, filters: rowFilter.shape.filters.min(1) }) satisfies z.ZodType<DbFullRowBody>;
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
const sqlSchema = z.object({ session: sessionId, sql: z.string().trim().min(1, "SQL を入れてください").max(1_000_000), write: z.boolean(), offset: z.number().int().min(0).optional() }) satisfies z.ZodType<DbSqlBody>;

/** テーブルの行の変更（値は 100 万文字まで・1 行の列は 1000 個まで・1 回に DB_EDITS_MAX 個まで） */
const editValues = z.record(objectName, z.string().max(1_000_000).nullable()).refine((v) => Object.keys(v).length <= 1000, "列が多すぎます");
const editKey = z
  .record(objectName, z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]))
  .refine((k) => Object.keys(k).length > 0 && Object.keys(k).length <= 32, "行を指すキーがありません");
const editsSchema = z.object({
  path: objectPath,
  table: objectName,
  edits: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("update"), key: editKey, values: editValues }),
        z.object({ kind: z.literal("insert"), values: editValues }),
        z.object({ kind: z.literal("delete"), key: editKey }),
      ]),
    )
    .min(1)
    .max(DB_EDITS_MAX),
  write: z.boolean(),
}) satisfies z.ZodType<DbEditsBody>;

/**
 * DB クライアント（接続の登録・試す・木・テーブル・SQL）。この Mac からの頼みだけ受ける（LAN は暗号化なしの HTTP で、
 * 読むだけでも DB の中身が流れるため）。変えたら db_connections の知らせ（中身なし）を出し、画面はここから読み直す
 */
export function databaseRoutes(app: Hono, { store, databases }: ServerDeps) {
  const { withProject } = lookups(store);
  const thisMacOnly = localOnly("DB クライアントは、この Mac からだけ使えます");
  app.use("/api/projects/:id/db-connections", thisMacOnly);
  app.use("/api/projects/:id/db-connections/*", thisMacOnly);

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
  const checkFields = (project: Project, body: Pick<NewDbConnectionBody, "engine" | "host" | "file_path" | "ssh" | "prep">) => {
    if (body.engine === "sqlite") {
      if (!body.file_path) throw new Invalid("SQLite のファイルを指定してください");
      databases.checkFile(body.file_path, project);
    } else if (!body.host) throw new Invalid("ホストを指定してください");
    if (body.ssh && body.prep?.tunnel?.trim()) throw new Invalid("SSH トンネルとポートを転送するコマンドは、どちらか 1 つにしてください");
  };

  const base = "/api/projects/:id/db-connections";

  app.get(base, withProject, (c) => c.json(store.dbConnections.list(c.var.project.id)));

  app.post(base, withProject, async (c) => {
    const body = newConnectionSchema.parse(await jsonBody(c));
    checkFields(c.var.project, body);
    return c.json(store.dbConnections.create(c.var.project.id, await databases.vault.seal(body)), 201);
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
    const {
      id: _id,
      project_id: _p,
      position: _pos,
      has_password: _h,
      has_ai_password: _ha,
      has_ssh_password: _hs,
      prep_confirmed: _pc,
      last_connected_at: _l,
      created_at: _c,
      updated_at: _u,
      ...fields
    } = from;
    // パスワードは暗号化したまま写す
    const password = copy_password ? store.dbConnections.password(from.id) : null;
    // 手順メモはプロジェクトごとのメモのフォルダにあるので写さない。準備のコマンドは写すが、写した先で確かめ直す
    const ai_password = copy_password ? store.dbConnections.aiPassword(from.id) : null;
    const ssh_password = copy_password ? store.dbConnections.sshPassword(from.id) : null;
    return c.json(store.dbConnections.create(c.var.project.id, { ...fields, memo_path: null, password, ai_password, ssh_password }), 201);
  });

  // プロジェクトから取り込む: 見つけた接続の案（パスワードは返さない）と、選んだ案を作る（パスワードは見つけた所から読み直す）
  const scanImports = (project: Project) =>
    scanProjectDbs(project.repo_path, (absolute) => {
      try {
        databases.checkFile(absolute, project);
        return true;
      } catch {
        return false;
      }
    });
  app.get(`${base}/import`, withProject, async (c) => {
    const found = await scanImports(c.var.project);
    return c.json(toImportCandidates(found, store.dbConnections.list(c.var.project.id), c.var.project.repo_path));
  });
  app.post(`${base}/import`, withProject, async (c) => {
    const { items } = importSchema.parse(await jsonBody(c));
    const found = new Map((await scanImports(c.var.project)).map((f) => [f.key, f]));
    const picked = items.map((item) => {
      const f = found.get(item.key);
      if (!f) throw new NotFound("取り込む接続が見つかりません。プロジェクトの中が変わったかもしれないので、開き直してください");
      return { item, f };
    });
    const created = picked.map(({ item, f }) => {
      const body: NewDbConnectionBody = {
        name: item.name,
        engine: f.engine,
        environment: item.environment,
        host: f.host,
        port: f.port,
        database: f.database,
        username: f.username,
        file_path: f.file_path,
        ssl: f.ssl,
        ...DB_ENVIRONMENT_DEFAULTS[item.environment],
        password: f.password,
      };
      checkFields(c.var.project, body);
      return body;
    });
    const sealed = await Promise.all(created.map((body) => databases.vault.seal(body)));
    return c.json(sealed.map((body) => store.dbConnections.create(c.var.project.id, body)), 201);
  });

  // 踏み台のサーバーの鍵: 見る（初めてのサーバーの指紋を画面で確かめる）・受け入れて ~/.ssh/known_hosts に足す
  app.post(`${base}/ssh-host-key`, withProject, async (c) => {
    const body = hostKeySchema.parse(await jsonBody(c));
    return c.json(await scanSshHostKey(body.ssh));
  });
  app.post(`${base}/ssh-host-key/accept`, withProject, async (c) => {
    const body = hostKeySchema.parse(await jsonBody(c));
    await acceptSshHostKey(body.ssh, body.fingerprints ?? []);
    return c.body(null, 204);
  });
  // ~/.ssh/config の Host（SSH の欄の候補）
  app.get(`${base}/ssh-hosts`, withProject, async (c) => c.json(await sshConfigHosts()));

  app.post(`${base}/test`, withProject, async (c) => {
    const body = testSchema.parse(await jsonBody(c));
    return c.json(await databases.test(c.var.project, body, await workdirOf(c, c.var.project)));
  });

  app.patch(`${base}/:cid`, withProject, withConnection, async (c) => {
    const patch = connectionPatchSchema.parse(await jsonBody(c));
    const merged = { ...c.var.connection, ...patch };
    checkFields(c.var.project, merged);
    const updated = store.dbConnections.update(c.var.connection.id, await databases.vault.seal(patch));
    // パスワードを保存し直したら、キーチェーンで開けなかったときに入れた値は使わない
    if (patch.password !== undefined || patch.ai_password !== undefined || patch.ssh_password !== undefined) databases.vault.forget(c.var.connection.id);
    return c.json(updated);
  });

  // 保存したパスワードをキーチェーンで開けなかったときに、利用者が入れたパスワード（Kickoff を終えるまでコアのメモリにだけ持つ。保存した値は変えない）
  app.post(`${base}/:cid/entered-passwords`, withProject, withConnection, async (c) => {
    const body = enteredPasswordsSchema.parse(await jsonBody(c));
    databases.vault.enter(c.var.connection.id, body);
    return c.body(null, 204);
  });

  app.delete(`${base}/:cid`, withProject, withConnection, (c) => {
    store.dbConnections.delete(c.var.connection.id);
    databases.vault.forget(c.var.connection.id);
    // 開いていた接続と SSH トンネルは待たずに閉じる
    void databases.forgetConnection(c.var.connection.id).catch(() => {});
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
    return c.json(await databases.rows(c.var.connection, c.var.project, await workdirOf(c, c.var.project), body.path, body.table, body.sort, body.offset, body.filter));
  });

  app.post(`${base}/:cid/disconnect`, withProject, withConnection, async (c) => {
    const { force } = z.object({ force: z.boolean().default(false) }).parse(await jsonBody(c));
    return c.json(await databases.disconnect(c.var.connection, force));
  });

  app.post(`${base}/:cid/full-row`, withProject, withConnection, async (c) => {
    const body = fullRowSchema.parse(await jsonBody(c));
    return c.json(await databases.fullRow(c.var.connection, c.var.project, await workdirOf(c, c.var.project), body.path, body.table, body.filters));
  });

  app.post(`${base}/:cid/count`, withProject, withConnection, async (c) => {
    const { path, name, filter } = z.object({ path: objectPath, name: objectName, filter: rowFilter.default(noFilter) }).parse(await jsonBody(c));
    return c.json(await databases.count(c.var.connection, c.var.project, await workdirOf(c, c.var.project), path, name, filter));
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

  // テーブルの行の変更をまとめて保存する（1 つのトランザクション）
  app.post(`${base}/:cid/edits`, withProject, withConnection, async (c) => {
    const body = editsSchema.parse(await jsonBody(c));
    return c.json(await databases.applyEdits(c.var.connection, c.var.project, await workdirOf(c, c.var.project), body));
  });

  // SQL の履歴（新しい順。AI が流したものは ran_by = ai とチャット）
  // つなぐ前の準備: 中身を確かめた・流す（待たずに 202。様子は GET で）・止める・記録（いつ・どのコマンド・成功 / 失敗）
  app.post(`${base}/:cid/prep/confirm`, withProject, withConnection, (c) => c.json(store.dbConnections.confirmPrep(c.var.connection.id)));
  app.post(`${base}/:cid/prepare`, withProject, withConnection, async (c) => c.json(await databases.prepare(c.var.connection), 202));
  app.get(`${base}/:cid/prepare`, withProject, withConnection, async (c) => c.json(await databases.prepState(c.var.connection)));
  app.post(`${base}/:cid/prepare/cancel`, withProject, withConnection, async (c) => {
    await databases.prepCancel(c.var.connection);
    return c.body(null, 204);
  });
  app.get(`${base}/:cid/prep-runs`, withProject, withConnection, (c) => c.json(store.dbPrepRuns.list(c.var.connection.id)));

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
