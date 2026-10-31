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
import { PROVIDER_IDS, type ProviderId } from "./types.js";
import { createWorkspace } from "./workspace.js";

export interface ServerDeps {
  store: Store;
  bus: Bus;
  token: string;
  providers: Record<ProviderId, AgentProvider>;
  usage: UsageMonitor;
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

const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(10_000),
    provider: z.enum(PROVIDER_IDS),
    test_command: z.string().max(500),
    deploy_instructions: z.string().max(10_000),
    auto_commit: z.boolean(),
  })
  .partial();

/**
 * Kickoff の HTTP API。デスクトップの画面・スマホのブラウザ・将来のネイティブアプリが共通で使う。
 * 認証はトークン（Cookie または Authorization: Bearer）。
 */
export function createApp(deps: ServerDeps): Hono {
  const { store, bus, token, providers, usage } = deps;
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

  app.get("/api/projects/:id", (c) => c.json(requireProject(store, c.req.param("id"))));

  app.patch("/api/projects/:id", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    return c.json(store.updateProject(project.id, projectPatchSchema.parse(await c.req.json())));
  });

  // Kickoff の管理から外すだけで、フォルダやリポジトリは削除しない
  app.delete("/api/projects/:id", (c) => {
    const project = requireProject(store, c.req.param("id"));
    store.deleteProject(project.id);
    return c.json({ ok: true });
  });

  // ---- 外部 CLI の状態 ----
  app.get("/api/providers", async (c) =>
    c.json(await Promise.all(PROVIDER_IDS.map((id) => providers[id].status()))),
  );
  app.get("/api/github", async (c) => c.json(await githubStatus()));

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

function setAuthCookie(c: Context, token: string) {
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
