// DB クライアントの受け口（取り決め @shared/database/contract.ts。接続の登録・試す・木・テーブル・SQL・ER 図・準備と、Docker タブの「DB で開く」）。
// この Mac からの頼みだけ受ける（access を書かない。LAN は暗号化なしの HTTP で、読むだけでも DB の中身が流れるため）。
// 変えたら db_connections の知らせ（中身なし）を出し、画面はここから読み直す
import { z } from "zod";
import { databaseContract } from "@shared/database/contract";
import { DB_AI_ACCESSES, DB_WRITE_CHECKS, DB_CONNECTION_NAME_MAX, DB_ENGINES, DB_ENVIRONMENTS, DB_EDITS_MAX, DB_ER_MAX, DB_FILTER_OPS, DB_HISTORY_MAX, type DbRowFilter } from "@shared/database/types";
import type { CopyDbConnectionBody, DbConnectionTestBody, DbEditsBody, DbEnteredPasswordsBody, DbErBody, DbErLayoutBody, DbImportBody, DbRowsBody, DbFullRowBody, DbSqlAssistBody, DbSqlBody, DbSshHostKeyBody, NewDbConnectionBody } from "@shared/database/api";
import type { Project } from "@shared/projects/types";
import { implement, textParam, type Param } from "@/foundation/core/http/implement";
import { parseId } from "@/foundation/core/http/input";
import { workdirQuery } from "@/foundation/core/http/zodParts";
import { toImportCandidates } from "@/features/database/core/import/index";
import { dockerDbTarget, sameServerConnection } from "@/features/database/core/import/dockerTarget";
import { resolveDbScope, workplaceOf } from "@/features/database/core/scope";
import type { DatabaseService } from "@/features/database/core/service";
import { acceptSshHostKey, scanSshHostKey, sshConfigHosts } from "@/features/database/core/sshHostKey";
import type { DockerApi } from "@/features/docker/core/index";

// ---- 入力の形 ----

const text = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => v || null);
const ssl = z.object({ mode: z.enum(["require", "verify"]), ca_path: text(2000) }).nullable();
/** SSH トンネル（ホストは ~/.ssh/config の Host かホスト名。「-」で始まるものは ssh のオプションと取り違えるので断る） */
const sshHost = z.string().trim().min(1).max(500)
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
/** つなぐ先の欄の組（DbEndpoint。登録・試すが extend で足す） */
const dbEndpointShape = z.object({
  engine: z.enum(DB_ENGINES),
  host: text(500),
  port: z.number().int().min(1).max(65535).nullable(),
  database: text(500),
  username: text(500),
  file_path: text(2000),
  ssl,
});
const password = z.string().max(10_000).nullable().optional();
const connectionName = z.string().trim().min(1).max(DB_CONNECTION_NAME_MAX);
const environment = z.enum(DB_ENVIRONMENTS);
const connectionSchema = dbEndpointShape.extend({
  name: connectionName,
  environment,
  read_only: z.boolean(),
  write_check: z.enum(DB_WRITE_CHECKS).optional(),
  ai_access: z.enum(DB_AI_ACCESSES),
  password,
  ai_username: text(500).optional(),
  ai_password: password,
  // 手順ノート: ノートのフォルダからの相対パス（/ で始まる・.. を含むものは断る）
  note_path: text(1000)
    .refine((v) => v === null || (!v.startsWith("/") && !v.split("/").includes("..")), "手順ノートはノートのフォルダの中のノートを選んでください")
    .optional(),
  ssh: ssh.optional(),
  ssh_password: password,
  prep: prep.optional(),
  check_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD で書いてください").nullable().optional(),
  check_note: text(200).optional(),
}) satisfies z.ZodType<NewDbConnectionBody, unknown>;
const enteredPassword = z.string().min(1).max(10_000).optional();
const enteredPasswordsSchema = z.object({ password: enteredPassword, ai_password: enteredPassword, ssh_password: enteredPassword }) satisfies z.ZodType<DbEnteredPasswordsBody>;

const testSchema = dbEndpointShape.extend({
  environment,
  password,
  ssh: ssh.optional(),
  ssh_password: password,
  prep: prep.optional(),
  connection_id: z.number().int().positive().optional(),
}) satisfies z.ZodType<DbConnectionTestBody, unknown>;
const hostKeySchema = z.object({
  ssh: ssh.unwrap(),
  fingerprints: z.array(z.string().max(200)).max(20).optional(),
}) satisfies z.ZodType<DbSshHostKeyBody, unknown>;
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(DB_HISTORY_MAX).optional() });
const importSchema = z.object({
  items: z
    .array(z.object({ key: z.string().min(1).max(4300), name: connectionName, environment }))
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
const erScope = z.string().min(1).max(1001);
const erPoint = z.object({ x: z.number().finite(), y: z.number().finite() });
/** 位置は描けるテーブルの数の数倍まで（選び直して隠したテーブルの位置も残す） */
const erLayoutSchema = z.object({
  scope: erScope,
  positions: z.record(objectName, erPoint).refine((p) => Object.keys(p).length <= DB_ER_MAX * 10, "位置が多すぎます"),
}) satisfies z.ZodType<DbErLayoutBody>;
/** SQL のタブの接続の名前（画面が作る。英数字・- と _） */
const sessionId = z.string().regex(/^[\w-]{1,64}$/, "SQL のタブの指定が正しくありません");
const erScopeQuery = z.object({ scope: erScope });
const sqlAssistSchema = z.object({ path: objectPath, request: z.string().trim().min(1).max(2000), sql: z.string().max(20_000) }) satisfies z.ZodType<DbSqlAssistBody>;
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

const pathBody = z.object({ path: objectPath });

export interface DatabaseRouteDeps {
  projectParam: Param<Project>;
  databases: DatabaseService;
  docker: Pick<DockerApi, "dbCandidate">;
}

export function databaseRoutes({ projectParam, databases, docker }: DatabaseRouteDeps) {
  /** パスの接続（このプロジェクトのものでなければ 404） */
  const own = ({ projectId, connectionId }: { projectId: Project; connectionId: number }) => databases.of(projectId, connectionId);
  /** 接続・プロジェクト・作業場所（DB の場所） */
  const scopeOf = (ctx: { projectId: Project; connectionId: number; workdir: string }) => resolveDbScope(own(ctx), ctx.projectId, ctx.workdir);

  return implement(databaseContract, {
    context: { projectId: projectParam, connectionId: { parse: parseId }, session: textParam(sessionId) },
    "GET /api/projects/:projectId/db-connections": { run: ({ projectId }) => databases.list(projectId.id) },
    // つないでいる接続（DB タブの左の一覧の印。変わったら SSE の db_connection_state）
    "GET /api/projects/:projectId/db-connections/connected": { run: ({ projectId }) => ({ ids: databases.connectedIds(projectId.id) }) },
    "POST /api/projects/:projectId/db-connections": { body: connectionSchema, run: ({ projectId, body }) => databases.create(projectId, body) },
    // ほかのプロジェクトの接続を写す（パスワードは選んだときだけ）
    "POST /api/projects/:projectId/db-connections/copy": { body: copySchema, run: ({ projectId, body }) => databases.copy(projectId, body.from_id, body.copy_password) },
    // プロジェクトから取り込む: 見つけた接続の案（パスワードは返さない）と、選んだ案を作る（パスワードは見つけた所から読み直す）
    "GET /api/projects/:projectId/db-connections/import": { run: ({ projectId }) => databases.importCandidates(projectId) },
    "POST /api/projects/:projectId/db-connections/import": { body: importSchema, run: ({ projectId, body }) => databases.importConnections(projectId, body.items) },
    // 踏み台のサーバーの鍵: 見る（初めてのサーバーの指紋を画面で確かめる）・受け入れて ~/.ssh/known_hosts に足す
    "POST /api/projects/:projectId/db-connections/ssh-host-key": { body: hostKeySchema, run: ({ body }) => scanSshHostKey(body.ssh) },
    "POST /api/projects/:projectId/db-connections/ssh-host-key/accept": { body: hostKeySchema, run: ({ body }) => acceptSshHostKey(body.ssh, body.fingerprints ?? []) },
    // ~/.ssh/config の Host（SSH の欄の候補）
    "GET /api/projects/:projectId/db-connections/ssh-hosts": { run: () => sshConfigHosts() },
    "POST /api/projects/:projectId/db-connections/test": { query: workdirQuery, body: testSchema, run: ({ projectId, body, workdir }) => databases.test(projectId, body, workplaceOf(projectId, workdir)) },
    "PATCH /api/projects/:projectId/db-connections/:connectionId": { body: connectionSchema.partial(), run: (ctx) => databases.update({ connection: own(ctx), project: ctx.projectId }, ctx.body) },
    // 保存したパスワードをキーチェーンで開けなかったときに、利用者が入れたパスワード（Kickoff を終えるまでコアのメモリにだけ持つ。保存した値は変えない）
    "POST /api/projects/:projectId/db-connections/:connectionId/entered-passwords": { body: enteredPasswordsSchema, run: (ctx) => databases.enterPasswords(own(ctx), ctx.body) },
    "DELETE /api/projects/:projectId/db-connections/:connectionId": { run: (ctx) => databases.removeConnection(own(ctx).id) },

    // ---- 木・テーブル（接続ごとに共有の 1 本） ----
    "GET /api/projects/:projectId/db-connections/:connectionId/databases": { query: workdirQuery, run: (ctx) => databases.databases(scopeOf(ctx)) },
    "GET /api/projects/:projectId/db-connections/:connectionId/schemas": { query: workdirQuery.extend({ database: z.string().optional() }), run: (ctx) => databases.schemas(scopeOf(ctx), ctx.query.database ?? null) },
    "POST /api/projects/:projectId/db-connections/:connectionId/objects": { query: workdirQuery, body: pathBody, run: (ctx) => databases.objects(scopeOf(ctx), ctx.body.path) },
    "POST /api/projects/:projectId/db-connections/:connectionId/table": { query: workdirQuery, body: pathBody.extend({ name: objectName }), run: (ctx) => databases.table(scopeOf(ctx), ctx.body.path, ctx.body.name) },
    "POST /api/projects/:projectId/db-connections/:connectionId/definition": {
      query: workdirQuery,
      body: pathBody.extend({ kind: z.enum(["function", "enum"]), name: objectName }),
      run: (ctx) => databases.definition(scopeOf(ctx), ctx.body.path, ctx.body.kind, ctx.body.name),
    },
    "POST /api/projects/:projectId/db-connections/:connectionId/rows": { query: workdirQuery, body: rowsSchema, run: (ctx) => databases.rows(scopeOf(ctx), ctx.body) },
    "POST /api/projects/:projectId/db-connections/:connectionId/disconnect": { body: z.object({ force: z.boolean().default(false) }), run: (ctx) => databases.disconnect(own(ctx), ctx.body.force) },
    "POST /api/projects/:projectId/db-connections/:connectionId/full-row": { query: workdirQuery, body: fullRowSchema, run: (ctx) => databases.fullRow(scopeOf(ctx), ctx.body) },
    "POST /api/projects/:projectId/db-connections/:connectionId/count": {
      query: workdirQuery,
      body: pathBody.extend({ name: objectName, filter: rowFilter.default(noFilter) }),
      run: (ctx) => databases.count(scopeOf(ctx), ctx.body.path, ctx.body.name, ctx.body.filter),
    },
    "POST /api/projects/:projectId/db-connections/:connectionId/outline": { query: workdirQuery, body: pathBody, run: (ctx) => databases.outline(scopeOf(ctx), ctx.body.path) },
    // SQL のタブの「AI に頼む」: テーブルと列の名前（値は渡さない）・いまの SQL・頼みから、プロジェクトの AI に 1 回だけ SQL を書いてもらう
    "POST /api/projects/:projectId/db-connections/:connectionId/sql-assist": { query: workdirQuery, body: sqlAssistSchema, run: (ctx) => databases.sqlAssist(scopeOf(ctx), ctx.body) },

    // ---- ER 図（動かしたテーブルの位置は接続と場所ごと。消すと「自動で並べ直す」） ----
    "POST /api/projects/:projectId/db-connections/:connectionId/er": { query: workdirQuery, body: erSchema, run: (ctx) => databases.er(scopeOf(ctx), ctx.body.path, ctx.body.names) },
    "GET /api/projects/:projectId/db-connections/:connectionId/er-layout": { query: erScopeQuery, run: (ctx) => databases.erLayouts.get(own(ctx).id, ctx.query.scope) },
    "PUT /api/projects/:projectId/db-connections/:connectionId/er-layout": { body: erLayoutSchema, run: (ctx) => databases.erLayouts.set(own(ctx).id, ctx.body.scope, ctx.body.positions) },
    "DELETE /api/projects/:projectId/db-connections/:connectionId/er-layout": { query: erScopeQuery, run: (ctx) => databases.erLayouts.delete(own(ctx).id, ctx.query.scope) },

    // ---- SQL のタブ（タブごとの接続） ----
    "POST /api/projects/:projectId/db-connections/:connectionId/sql": { query: workdirQuery, body: sqlSchema, run: (ctx) => databases.sql(scopeOf(ctx), ctx.body) },
    // テーブルの行の変更をまとめて保存する（1 つのトランザクション）
    "POST /api/projects/:projectId/db-connections/:connectionId/edits": { query: workdirQuery, body: editsSchema, run: (ctx) => databases.applyEdits(scopeOf(ctx), ctx.body) },

    // つなぐ前の準備: 中身を確かめた・流す（待たずに 202。様子は GET で）・止める・記録（いつ・どのコマンド・成功 / 失敗）
    "POST /api/projects/:projectId/db-connections/:connectionId/prep/confirm": { run: (ctx) => databases.prep.confirm(own(ctx)) },
    "POST /api/projects/:projectId/db-connections/:connectionId/prepare": { run: (ctx) => databases.prep.prepare(own(ctx)) },
    "GET /api/projects/:projectId/db-connections/:connectionId/prepare": { run: (ctx) => databases.prep.state(own(ctx)) },
    "POST /api/projects/:projectId/db-connections/:connectionId/prepare/cancel": { run: (ctx) => databases.prep.cancel(own(ctx)) },
    "GET /api/projects/:projectId/db-connections/:connectionId/prep-runs": { run: (ctx) => databases.prep.runs(own(ctx)) },
    // SQL の履歴（新しい順。AI が流したものは ran_by = ai とチャット）
    "GET /api/projects/:projectId/db-connections/:connectionId/history": { query: historyQuery, run: (ctx) => databases.history(own(ctx), ctx.query.limit ?? 200) },

    "POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/cancel": { run: (ctx) => databases.cancel(own(ctx), ctx.session) },
    "GET /api/projects/:projectId/db-connections/:connectionId/sessions/:session": { run: (ctx) => ({ in_transaction: databases.inTransaction(own(ctx), ctx.session) }) },
    "POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/commit": { run: (ctx) => databases.commit(own(ctx), ctx.session) },
    "POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/rollback": { run: (ctx) => databases.rollback(own(ctx), ctx.session) },
    "DELETE /api/projects/:projectId/db-connections/:connectionId/sessions/:session": { run: (ctx) => databases.closeSession(own(ctx), ctx.session) },

    // Docker タブの「DB で開く」の行き先: 登録済みの同じ DB（種類・localhost・ポート）の接続か、取り込みの案か、押せない理由（材料は docker の dbCandidate）
    "GET /api/projects/:projectId/docker/db": {
      query: z.object({ compose: z.string().min(1).max(4000), service: z.string().min(1).max(200) }),
      run: async ({ projectId: project, query }) => {
        const result = await dockerDbTarget(docker, project, query.compose, query.service);
        if ("blocked" in result) return { connection_id: null, candidate: null, blocked: result.blocked };
        const connections = databases.list(project.id);
        const same = sameServerConnection(connections, result.found);
        const candidate = same ? null : (toImportCandidates([result.found], connections, project.repo_path)[0] ?? null);
        return { connection_id: same?.id ?? null, candidate, blocked: null };
      },
    },
  });
}
