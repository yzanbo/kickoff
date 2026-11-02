import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { AUTH_COOKIE, tokenMatches } from "./auth.js";
import type { Bus } from "./bus.js";
import type { AgentProvider } from "./providers/index.js";
import type { Store } from "./store.js";
import type { ServiceUsageMonitor } from "./serviceUsage/index.js";
import type { UsageMonitor } from "./usage.js";
import type { ApprovalCenter } from "./approvals.js";
import type { Runner } from "./runner.js";
import type { UploadStore } from "./uploads.js";
import { agentRoutes } from "./routes/agents.js";
import { filesRoutes } from "./routes/files.js";
import { gitRoutes } from "./routes/git.js";
import { groupRoutes } from "./routes/groups.js";
import { HttpError } from "./routes/http.js";
import { projectRoutes } from "./routes/projects.js";
import { runRoutes } from "./routes/runs.js";
import { settingsRoutes } from "./routes/settings.js";
import { taskRoutes } from "./routes/tasks.js";
import { uploadRoutes } from "./routes/uploads.js";
import { worktreeRoutes } from "./routes/worktrees.js";
import type { ProviderId, ServerStatus } from "./types.js";

export interface ServerDeps {
  store: Store;
  bus: Bus;
  token: string;
  providers: Record<ProviderId, AgentProvider>;
  usage: UsageMonitor;
  /** 設定の「使用状況」のサービスごとの使用状況 */
  serviceUsage: ServiceUsageMonitor;
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

/**
 * Kickoff の HTTP API。デスクトップの画面・スマホのブラウザ・将来のネイティブアプリが共通で使う。
 * 認証はトークン（Cookie または Authorization: Bearer）。
 */
export function createApp(deps: ServerDeps): Hono {
  const { store, bus, token, runner } = deps;
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

  // ---- 機能ごとの API（routes/ に分けている。登録の順は変えない） ----
  settingsRoutes(app, deps);
  projectRoutes(app, deps);
  taskRoutes(app, deps);
  runRoutes(app, deps);
  groupRoutes(app, deps);
  uploadRoutes(app, deps);
  agentRoutes(app, deps);
  gitRoutes(app, deps);
  filesRoutes(app, deps);
  worktreeRoutes(app, deps);

  // ---- リアルタイム配信（SSE） ----
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = bus.subscribe((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
      // 切断の知らせは、待つ前（最初の書き込みの前）に受け取れるようにしておく
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
      // 何か書くまで応答ヘッダーが届かず、画面が「接続中」のままになるので、つないだらすぐ 1 回送る
      await stream.writeSSE({ event: "ping", data: "" });
      await closed;
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

function setAuthCookie(c: Context, token: string) {
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
