import fs from "node:fs";
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
import {
  EFFORT_LEVELS,
  PERMISSION_CHOICES,
  PHASES,
  PROVIDER_IDS,
  TASK_STATUSES,
  type ApprovalDecision,
  type ModelOption,
  type ProviderId,
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
  /** ビルド済みの画面（本番時）。開発時は Vite が配信するので未指定 */
  staticDir?: string;
}

const settingsSchema = z
  .object({
    maxConcurrentRuns: z.number().int().min(1).max(8),
    defaultProvider: z.enum(PROVIDER_IDS),
    claudeModel: z.string().max(100),
    remoteEnabled: z.boolean(),
    ntfyUrl: z.union([z.literal(""), z.url()]),
    projectsDir: z.string().min(1).max(500),
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
  })
  .partial()
  .default({});

const runInputSchema = z.object({
  phase: z.enum(PHASES),
  task_id: z.number().int().optional(),
  prompt: z.string().trim().min(1).max(50_000),
  options: runOptionsSchema,
});


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
  })
  .partial();

/**
 * Kickoff の HTTP API。デスクトップの画面・スマホのブラウザ・将来のネイティブアプリが共通で使う。
 * 認証はトークン（Cookie または Authorization: Bearer）。
 */
export function createApp(deps: ServerDeps): Hono {
  const { store, bus, token, providers, usage, runner, approvals } = deps;
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

  app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.0" }));

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
    const patch = projectPatchSchema.parse(await c.req.json());
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
    return c.json(store.updateProject(project.id, patch));
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
    return c.json(
      runner.start({ projectId: project.id, phase: input.phase, taskId: input.task_id, prompt: input.prompt, options: input.options }),
      201,
    );
  });

  app.get("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json({ run, events: store.listEvents(run.id), approvals: approvals.list({ runId: run.id }) });
  });

  // チャットの名前を変える
  app.patch("/api/runs/:id", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).parse(await c.req.json());
    return c.json(store.updateRun(run.id, { title }));
  });

  app.post("/api/runs/:id/messages", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text, options } = z
      .object({ text: z.string().trim().min(1).max(50_000), options: runOptionsSchema })
      .parse(await c.req.json());
    try {
      return c.json(runner.send(run.id, text, options));
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
  });

  app.post("/api/runs/:id/cancel", (c) => {
    const run = requireRun(store, c.req.param("id"));
    runner.cancel(run.id);
    return c.json({ ok: true });
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
