import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { AUTH_COOKIE, tokenMatches } from "./auth.js";
import { errorResponse } from "./errors.js";
import type { Bus } from "../bus.js";
import type { AgentProvider } from "../providers/index.js";
import type { Store } from "../db/store.js";
import type { ServiceUsageMonitor } from "../usage/services/index.js";
import type { UsageMonitor } from "../usage/planUsage.js";
import type { ApprovalCenter } from "../chat/approvals.js";
import type { Runner } from "../chat/runner.js";
import type { UploadStore } from "../chat/uploads.js";
import type { VoiceService } from "../voice/service.js";
import type { MemoService } from "../memos/memos.js";
import type { DatabaseService } from "../databases/service.js";
import type { GitHubService } from "../github/service.js";
import type { CiService } from "../github/ci.js";
import type { DockerService } from "../docker/service.js";
import { approvalRoutes } from "./routes/approvals.js";
import { chatRoutes } from "./routes/chats.js";
import { databaseRoutes } from "./routes/databases.js";
import { githubRoutes } from "./routes/github.js";
import { ciRoutes } from "./routes/ci.js";
import { dockerRoutes } from "./routes/docker.js";
import { filesRoutes } from "./routes/files.js";
import { gitRoutes } from "./routes/git.js";
import { groupRoutes } from "./routes/groups.js";
import { snippetRoutes } from "./routes/snippets.js";
import { memoRoutes } from "./routes/memos.js";
import { projectRoutes } from "./routes/projects.js";
import { providerRoutes } from "./routes/providers.js";
import { queueRoutes } from "./routes/queue.js";
import { settingsRoutes } from "./routes/settings.js";
import { turnRoutes } from "./routes/turns.js";
import { uploadRoutes } from "./routes/uploads.js";
import { usageRoutes } from "./routes/usage.js";
import { voiceRoutes } from "./routes/voice.js";
import { worktreeRoutes } from "./routes/worktrees.js";
import { worktreePrRoutes } from "./routes/worktreePrs.js";
import type { WorktreePrWatch } from "../git/prWatch.js";
import type { GitHubAccount, ProviderId, ServerStatus } from "@shared/types";

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
  /** 音声入力の文字起こしとモデルの管理 */
  voice: VoiceService;
  /** プロジェクトのメモ（保存先はプロジェクトの外） */
  memos: MemoService;
  /** ワークツリーの PR の見張り（マージ・マージせずに閉じたことの知らせ） */
  prWatch: WorktreePrWatch;
  /** DB クライアント（接続の登録・木・テーブル・SQL。DB の処理は別のプロセスの DB ワーカーで動かす） */
  databases: DatabaseService;
  /** GitHub タブ（連携先のリポジトリの issue・PR を読む） */
  github: GitHubService;
  /** CI の結果（GitHub Actions の実行・ログ・やり直し） */
  ci: CiService;
  /** Docker タブ（プロジェクトの compose の一覧・操作・docker events） */
  docker: DockerService;
  /** gh に入っている GitHub のアカウント（設定の「GitHub」。テストでは差し替えて、gh を呼ばない。なければ gh auth status） */
  githubAccounts?: () => Promise<GitHubAccount[]>;
  /** ゴミ箱へ移す（ファイルタブの「ゴミ箱に入れる」。テストでは差し替えて、本物のゴミ箱に入れない。なければ macOS のゴミ箱） */
  trash?: (file: string) => Promise<void>;
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

  // 失敗はここでまとめて応答にする（種類は errors.ts。知らない失敗だけ記録する）
  app.onError((err, c) => {
    const { status, body } = errorResponse(err);
    if (status === 500) console.error("[api]", err);
    return c.json(body, status);
  });

  app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));

  // 画面の左下の「接続」の詳細
  app.get("/api/status", (c) => {
    const settings = store.settings.get();
    const status: ServerStatus = {
      version: VERSION,
      started_at: STARTED_AT,
      host: deps.listen?.host ?? "127.0.0.1",
      port: deps.listen?.port ?? Number(new URL(c.req.url).port),
      remote_enabled: settings.remote_enabled,
      agents: runner.stats(),
      database_id: store.databaseId,
    };
    return c.json(status);
  });

  // ---- 機能ごとの API（http/routes/ に分けている。登録の順は変えない。:id の引き当ては lookups.ts、失敗の種類は errors.ts） ----
  settingsRoutes(app, deps);
  projectRoutes(app, deps);
  chatRoutes(app, deps);
  turnRoutes(app, deps);
  queueRoutes(app, deps);
  groupRoutes(app, deps);
  snippetRoutes(app, deps);
  uploadRoutes(app, deps);
  approvalRoutes(app, deps);
  providerRoutes(app, deps);
  usageRoutes(app, deps);
  gitRoutes(app, deps);
  filesRoutes(app, deps);
  worktreeRoutes(app, deps);
  worktreePrRoutes(app, deps);
  voiceRoutes(app, deps);
  memoRoutes(app, deps);
  databaseRoutes(app, deps);
  githubRoutes(app, deps);
  ciRoutes(app, deps);
  dockerRoutes(app, deps);

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

  // 知らない API は JSON の 404 にする（本番の画面の配信の「未知のパスは index.html」に落とすと、200 の HTML が返っていた）
  app.all("/api/*", (c) => c.json({ error: "API が見つかりません" }, 404));

  // ---- 画面（本番時） ----
  if (deps.staticDir && fs.existsSync(deps.staticDir)) {
    const root = path.relative(process.cwd(), deps.staticDir);
    // 画面のファイルは毎回問い合わせさせる（no-cache）。serveStatic は Last-Modified だけを付けるので、そのままだと
    // Chromium が経験則でキャッシュを新しいとみなし、アプリを入れ替えたあとの起動で古い index.html と古い JS を
    // サーバーに問い合わせずに使う（新しいコアとかみ合わず、画面が真っ暗になることがあった）
    app.use("/*", async (c, next) => {
      await next();
      c.res.headers.set("Cache-Control", "no-cache");
    });
    app.use("/*", serveStatic({ root }));
    // SPA のため、未知のパスは index.html を返す。ただし拡張子のあるパス（/assets/… の JS・CSS など）は 404 にする
    // （HTML を JS として読み込ませて、原因の分からない失敗にしない）
    const indexHtml = fs.readFileSync(path.join(deps.staticDir, "index.html"), "utf8");
    app.get("*", (c) => (path.extname(c.req.path) ? c.notFound() : c.html(indexHtml)));
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
