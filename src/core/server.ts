import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { AUTH_COOKIE, tokenMatches } from "./auth.js";
import type { Bus } from "./bus.js";
import { githubStatus } from "./github.js";
import type { AgentProvider } from "./providers/index.js";
import type { Store } from "./store.js";
import type { UsageMonitor } from "./usage.js";
import type { ApprovalCenter } from "./approvals.js";
import type { Runner } from "./runner.js";
import type { UploadStore } from "./uploads.js";
import {
  BOARD_STAGES,
  EFFORT_LEVELS,
  PERMISSION_CHOICES,
  PHASES,
  PROVIDER_IDS,
  TASK_STATUSES,
  type ApprovalDecision,
  type ModelOption,
  type Project,
  type ProviderId,
  type ServerStatus,
} from "./types.js";
import { createWorkspace, inspectWorkspace, prepareImportedWorkspace } from "./workspace.js";
import { normalizeScope } from "./scope.js";

export interface ServerDeps {
  store: Store;
  bus: Bus;
  token: string;
  providers: Record<ProviderId, AgentProvider>;
  usage: UsageMonitor;
  runner: Runner;
  approvals: ApprovalCenter;
  uploads: UploadStore;
  /** ビルド済みの画面（本番時）。開発時は Vite が配信するので未指定 */
  staticDir?: string;
  /** 待ち受けているアドレスとポート（接続の詳細の表示用） */
  listen?: { host: string; port: number };
}

const STARTED_AT = new Date().toISOString();
const VERSION = "0.1.0";

const settingsSchema = z
  .object({
    maxConcurrentRuns: z.number().int().min(1).max(8),
    defaultProvider: z.enum(PROVIDER_IDS),
    remoteEnabled: z.boolean(),
    ntfyUrl: z.union([z.literal(""), z.url()]),
    desktopNotifications: z.boolean(),
    projectsDir: z.string().min(1).max(500),
    claudeModel: z.string().min(1).max(100),
    defaultEffort: z.enum(EFFORT_LEVELS).nullable(),
    defaultPermission: z.enum(PERMISSION_CHOICES),
    defaultFastMode: z.boolean(),
  })
  .partial();

const newProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  idea: z.string().max(10_000).default(""),
  parent_dir: z.string().trim().min(1),
  folder_name: z.string().trim().min(1).max(100),
  provider: z.enum(PROVIDER_IDS).optional(),
});

const importProjectSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(10_000).default(""),
  init_git: z.boolean().default(false),
  provider: z.enum(PROVIDER_IDS).optional(),
});

const taskInputSchema = z.object({
  phase: z.enum(PHASES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  acceptance_criteria: z.string().max(20_000).default(""),
  priority: z.number().int().min(1).max(3).default(2),
});

const taskPatchSchema = z
  .object({
    phase: z.enum(PHASES),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000),
    acceptance_criteria: z.string().max(20_000),
    priority: z.number().int().min(1).max(3),
    status: z.enum(TASK_STATUSES),
  })
  .partial();

const runOptionsSchema = z
  .object({
    model: z.string().max(100).nullable(),
    effort: z.enum(EFFORT_LEVELS).nullable(),
    permission_mode: z.enum(PERMISSION_CHOICES).nullable(),
    fast_mode: z.boolean().nullable(),
  })
  .partial()
  .default({});

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(300),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
});

// 本文が空でも、添付があれば送れる
const runInputSchema = z
  .object({
    phase: z.enum(PHASES),
    task_id: z.number().int().optional(),
    prompt: z.string().trim().max(50_000).default(""),
    options: runOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
    stage: z.enum(BOARD_STAGES).optional(),
    group_id: z.number().int().optional(),
  })
  .refine((v) => v.prompt || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });

const messageInputSchema = z
  .object({
    text: z.string().trim().max(50_000).default(""),
    options: runOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
  })
  .refine((v) => v.text || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });


const decisionSchema: z.ZodType<ApprovalDecision> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allow") }),
  z.object({ action: z.literal("allow_always") }),
  z.object({ action: z.literal("deny"), message: z.string().max(5000).optional() }),
  z.object({
    action: z.literal("answer"),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    response: z.string().max(5000).optional(),
  }),
]);

const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(10_000),
    provider: z.enum(PROVIDER_IDS),
    test_command: z.string().max(500),
    deploy_instructions: z.string().max(10_000),
    auto_commit: z.boolean(),
    write_scopes: z
      .object({
        requirements: z.array(z.string().max(500)).max(20),
        schedule: z.array(z.string().max(500)).max(20),
      })
      .partial(),
    // 参照資料（パスだけ送ればよい。種類はサーバーで調べる）
    references: z.array(z.object({ path: z.string().trim().min(1).max(1000) })).max(50),
    // 送った内容で置き換える（書いていない項目はアプリ全体の設定に従う）
    defaults: z
      .object({
        model: z.string().min(1).max(100),
        effort: z.enum(EFFORT_LEVELS).nullable(),
        permission: z.enum(PERMISSION_CHOICES),
        fastMode: z.boolean(),
        section: z.enum(PHASES),
        stage: z.enum(BOARD_STAGES),
      })
      .partial()
      .strict(),
  })
  .partial();

/**
 * Kickoff の HTTP API。デスクトップの画面・スマホのブラウザ・将来のネイティブアプリが共通で使う。
 * 認証はトークン（Cookie または Authorization: Bearer）。
 */
export function createApp(deps: ServerDeps): Hono {
  const { store, bus, token, providers, usage, runner, approvals, uploads } = deps;
  const app = new Hono();

  // スマホなどのペアリング: QR の URL に含めたトークンを Cookie に移してから画面へ
  app.get("/pair", (c) => {
    if (!tokenMatches(token, c.req.query("token"))) return c.text("トークンが正しくありません", 401);
    setAuthCookie(c, token);
    return c.redirect("/");
  });

  app.use("/api/*", async (c, next) => {
    const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (tokenMatches(token, bearer) || tokenMatches(token, getCookie(c, AUTH_COOKIE))) return next();
    return c.json({ error: "unauthorized" }, 401);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return c.json({ error: "入力が正しくありません", issues: err.issues }, 400);
    console.error("[api]", err);
    return c.json({ error: err.message }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));

  // 画面の左下の「接続」の詳細
  app.get("/api/status", (c) => {
    const settings = store.getSettings();
    const status: ServerStatus = {
      version: VERSION,
      started_at: STARTED_AT,
      host: deps.listen?.host ?? "127.0.0.1",
      port: deps.listen?.port ?? Number(new URL(c.req.url).port),
      remote_enabled: settings.remoteEnabled,
      agents: { ...runner.stats(), max: settings.maxConcurrentRuns },
    };
    return c.json(status);
  });

  // ---- 設定 ----
  app.get("/api/settings", (c) => c.json(store.getSettings()));
  app.put("/api/settings", async (c) => c.json(store.updateSettings(settingsSchema.parse(await c.req.json()))));

  // ---- プロジェクト ----
  app.get("/api/projects", (c) => c.json(store.listProjects()));

  app.post("/api/projects", async (c) => {
    const input = newProjectSchema.parse(await c.req.json());
    const repoPath = await createWorkspace({
      parentDir: input.parent_dir,
      folderName: input.folder_name,
      name: input.name,
      idea: input.idea,
    }).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const project = store.createProject({
      name: input.name,
      description: input.idea,
      repo_path: repoPath,
      provider: input.provider ?? store.getSettings().defaultProvider,
    });
    store.updateSettings({ projectsDir: input.parent_dir });
    return c.json(project, 201);
  });

  // 既存フォルダの点検（取り込みダイアログでの事前表示用）
  app.get("/api/workspace/inspect", async (c) => {
    const info = await inspectWorkspace(c.req.query("path") ?? "");
    const registered = info.gitRoot ? store.findProjectByPath(info.gitRoot) : store.findProjectByPath(info.path);
    return c.json({ ...info, registered_project_id: registered?.id ?? null });
  });

  app.post("/api/projects/import", async (c) => {
    const input = importProjectSchema.parse(await c.req.json());
    const repoPath = await prepareImportedWorkspace(input.path, input.init_git).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    const existing = store.findProjectByPath(repoPath);
    if (existing) throw new HttpError(409, `このフォルダは「${existing.name}」として登録済みです`);
    const project = store.createProject({
      name: input.name,
      description: input.description,
      repo_path: repoPath,
      provider: input.provider ?? store.getSettings().defaultProvider,
    });
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", (c) => c.json(requireProject(store, c.req.param("id"))));

  app.patch("/api/projects/:id", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { references, ...patch } = projectPatchSchema.parse(await c.req.json());
    if (patch.write_scopes) {
      // フォルダはリポジトリからの相対パスに揃え、外を指すものは拒否する
      const merged = { ...project.write_scopes };
      for (const [section, folders] of Object.entries(patch.write_scopes) as [keyof typeof merged, string[]][]) {
        try {
          merged[section] = [...new Set(folders.map((f) => normalizeScope(project.repo_path, f)))];
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
      }
      patch.write_scopes = merged;
    }
    return c.json(store.updateProject(project.id, { ...patch, ...(references ? { references: resolveReferences(references) } : {}) }));
  });

  // Kickoff の管理から外すだけで、フォルダやリポジトリは削除しない
  app.delete("/api/projects/:id", (c) => {
    const project = requireProject(store, c.req.param("id"));
    store.deleteProject(project.id);
    return c.json({ ok: true });
  });

  // ---- タスク ----
  app.get("/api/projects/:id/tasks", (c) => c.json(store.listTasks(requireProject(store, c.req.param("id")).id)));

  app.post("/api/projects/:id/tasks", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const input = taskInputSchema.parse(await c.req.json());
    return c.json(store.createTask({ ...input, project_id: project.id, created_by: "user" }), 201);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const task = requireTask(store, c.req.param("id"));
    return c.json(store.updateTask(task.id, taskPatchSchema.parse(await c.req.json())));
  });

  app.delete("/api/tasks/:id", (c) => {
    const task = requireTask(store, c.req.param("id"));
    store.deleteTask(task.id);
    return c.json({ ok: true });
  });

  // ---- 成果物 ----
  app.get("/api/projects/:id/artifacts", (c) => c.json(store.listArtifacts(requireProject(store, c.req.param("id")).id)));
  app.get("/api/artifacts/:id", (c) => {
    const artifact = store.getArtifact(Number(c.req.param("id")));
    if (!artifact) throw new HttpError(404, "成果物が見つかりません");
    return c.json(artifact);
  });

  // ---- 実行（エージェントとの会話） ----
  app.get("/api/projects/:id/runs", (c) =>
    c.json(store.listRuns({ projectId: requireProject(store, c.req.param("id")).id, limit: 300 })),
  );

  app.post("/api/projects/:id/runs", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const input = runInputSchema.parse(await c.req.json());
    if (input.group_id !== undefined && requireGroup(store, String(input.group_id)).project_id !== project.id) {
      throw new HttpError(400, "ほかのプロジェクトのグループには入れられません");
    }
    const run = await runner.start({
      projectId: project.id,
      phase: input.phase,
      taskId: input.task_id,
      prompt: input.prompt,
      options: input.options,
      attachments: input.attachments,
      stage: input.stage,
      groupId: input.group_id,
    });
    return c.json(run, 201);
  });

  // チャットのやり取りのキーワード検索（⌘F）
  app.get("/api/search", (c) => {
    const num = (v: string | undefined) => (v ? Number(v) : undefined);
    return c.json(
      store.searchEvents(c.req.query("q") ?? "", {
        projectId: num(c.req.query("project_id")),
        runId: num(c.req.query("run_id")),
        limit: num(c.req.query("limit")),
      }),
    );
  });

  // 全プロジェクトのチャット（⌘K の検索・移動用）
  app.get("/api/runs", (c) => c.json(store.listRuns({ limit: Math.min(Number(c.req.query("limit") ?? 300), 1000) })));

  app.get("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json({ run, events: store.listEvents(run.id), approvals: approvals.list({ runId: run.id }) });
  });

  // チャットの名前・カンバンの列・グループを変える
  app.patch("/api/runs/:id", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { group_id, ...patch } = z
      .object({
        title: z.string().trim().min(1).max(100),
        stage: z.enum(BOARD_STAGES).nullable(),
        group_id: z.number().int().nullable(),
      })
      .partial()
      .parse(await c.req.json());
    if (group_id !== undefined) {
      if (group_id !== null && requireGroup(store, String(group_id)).project_id !== run.project_id) {
        throw new HttpError(400, "ほかのプロジェクトのグループには入れられません");
      }
      store.setRunGroup(run.id, group_id);
    }
    return c.json(Object.keys(patch).length ? store.updateRun(run.id, patch) : store.getRun(run.id));
  });

  // ---- チャットのグループ ----
  app.get("/api/projects/:id/groups", (c) => c.json(store.listGroups(requireProject(store, c.req.param("id")).id)));

  app.post("/api/projects/:id/groups", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(await c.req.json());
    return c.json(store.createGroup(project.id, name), 201);
  });

  app.put("/api/projects/:id/groups/order", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await c.req.json());
    return c.json(store.reorderGroups(project.id, ids));
  });

  app.patch("/api/groups/:id", async (c) => {
    const group = requireGroup(store, c.req.param("id"));
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(await c.req.json());
    return c.json(store.renameGroup(group.id, name));
  });

  // グループだけを消す（中のチャットはグループなしに戻る）
  app.delete("/api/groups/:id", (c) => {
    const group = requireGroup(store, c.req.param("id"));
    store.deleteGroup(group.id);
    return c.json({ ok: true });
  });

  // チャットを開いて確認した（確認待ちを消す）
  app.post("/api/runs/:id/seen", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json(run.attention ? store.updateRun(run.id, { attention: 0 }) : run);
  });

  // アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す
  app.post("/api/runs/:id/archive", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(await c.req.json().catch(() => ({})));
    if (archived && runner.isBusy(run.id)) throw new HttpError(409, "作業中のチャットはアーカイブできません。中断してから行ってください");
    return c.json(store.updateRun(run.id, { archived_at: archived ? new Date().toISOString() : null }));
  });

  // 削除（会話の記録も消える）
  app.delete("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    if (runner.isBusy(run.id)) throw new HttpError(409, "作業中のチャットは削除できません。中断してから行ってください");
    store.deleteRun(run.id);
    return c.json({ ok: true });
  });

  app.post("/api/runs/:id/messages", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    try {
      return c.json(await runner.send(run.id, text, options, attachments));
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
  });

  app.post("/api/runs/:id/cancel", (c) => {
    const run = requireRun(store, c.req.param("id"));
    runner.cancel(run.id);
    return c.json({ ok: true });
  });

  // ---- 添付ファイル ----
  app.post("/api/uploads", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const files = [body.file].flat().filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new HttpError(400, "ファイルがありません");
    const saved = [];
    for (const file of files) {
      try {
        saved.push(await uploads.save({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }));
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    return c.json(saved, 201);
  });

  // 画面での表示用（画像のサムネイルなど）
  app.get("/api/uploads/:id", async (c) => {
    const file = await uploads.resolve(c.req.param("id"));
    if (!file) throw new HttpError(404, "ファイルが見つかりません");
    const data = await fs.promises.readFile(file.path);
    const mime = c.req.query("mime") ?? "application/octet-stream";
    // 画像と PDF 以外はダウンロードさせる（スクリプトを画面の権限で開かせない）
    const inline = /^image\/(png|jpeg|gif|webp)$|^application\/pdf$/.test(mime);
    return c.body(data, 200, {
      "content-type": inline ? mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
    });
  });

  // ---- 承認依頼・AI からの質問 ----
  app.get("/api/approvals", (c) => {
    const projectId = c.req.query("project_id");
    return c.json(approvals.list({ projectId: projectId ? Number(projectId) : undefined }));
  });

  app.post("/api/approvals/:id", async (c) => {
    const decision = decisionSchema.parse(await c.req.json());
    if (!approvals.resolve(c.req.param("id"), decision)) throw new HttpError(404, "この依頼はすでに回答済みか、中断されています");
    return c.json({ ok: true });
  });

  // ---- 外部 CLI の状態 ----
  app.get("/api/providers", async (c) =>
    c.json(await Promise.all(PROVIDER_IDS.map((id) => providers[id].status()))),
  );
  app.get("/api/github", async (c) => c.json(await githubStatus()));

  // チャット欄のモデル一覧（取得に 1 秒ほどかかるのでキャッシュする）
  const modelCache = new Map<ProviderId, { at: number; models: ModelOption[] }>();
  app.get("/api/providers/:id/models", async (c) => {
    const id = z.enum(PROVIDER_IDS).parse(c.req.param("id"));
    const cached = modelCache.get(id);
    if (cached && Date.now() - cached.at < 60 * 60_000) return c.json(cached.models);
    const models = (await providers[id].models?.()) ?? [];
    if (models.length > 0) modelCache.set(id, { at: Date.now(), models });
    return c.json(models);
  });

  // ---- プランの使用枠（5 時間・週） ----
  app.get("/api/usage", async (c) => c.json(await usage.get()));
  app.post("/api/usage/refresh", async (c) => c.json(await usage.refresh(true)));

  // ---- リアルタイム配信（SSE） ----
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = bus.subscribe((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      unsubscribe();
    }),
  );

  // ---- 画面（本番時） ----
  if (deps.staticDir && fs.existsSync(deps.staticDir)) {
    const root = path.relative(process.cwd(), deps.staticDir);
    app.use("/*", serveStatic({ root }));
    // SPA のため、未知のパスは index.html を返す
    const indexHtml = fs.readFileSync(path.join(deps.staticDir, "index.html"), "utf8");
    app.get("*", (c) => c.html(indexHtml));
  }

  return app;
}

class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function requireProject(store: Store, idParam: string) {
  const project = store.getProject(Number(idParam));
  if (!project) throw new HttpError(404, "プロジェクトが見つかりません");
  return project;
}

function requireTask(store: Store, idParam: string) {
  const task = store.getTask(Number(idParam));
  if (!task) throw new HttpError(404, "タスクが見つかりません");
  return task;
}

/** 参照資料のパスを絶対パスにそろえ（~ はホームフォルダ）、フォルダかファイルかを調べる。見つからなければ 400 */
function resolveReferences(input: { path: string }[]): Project["references"] {
  const seen = new Set<string>();
  const out: Project["references"] = [];
  for (const { path: raw } of input) {
    const abs = path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
    if (seen.has(abs)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      throw new HttpError(400, `見つかりません: ${raw}`);
    }
    seen.add(abs);
    out.push({ path: abs, kind: stat.isDirectory() ? "folder" : "file" });
  }
  return out;
}

function requireGroup(store: Store, idParam: string) {
  const group = store.getGroup(Number(idParam));
  if (!group) throw new HttpError(404, "グループが見つかりません");
  return group;
}

function requireRun(store: Store, idParam: string) {
  const run = store.getRun(Number(idParam));
  if (!run) throw new HttpError(404, "実行が見つかりません");
  return run;
}

function setAuthCookie(c: Context, token: string) {
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
