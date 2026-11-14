import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/chat/visualDocument";
import { AUTH_COOKIE, tokenMatches } from "./auth.js";
import { callerOf, hashToken, setCaller } from "./caller.js";
import { deviceMaySee, deviceMayUse } from "./deviceAccess.js";
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
import type { PortWatch } from "../ports/watch.js";
import type { WorktreeEnvService } from "../worktreeEnv/service.js";
import type { SessionsUsedElsewhere } from "../trash/siblingSessions.js";
import type { TrashService } from "../trash/service.js";
import { approvalRoutes } from "./routes/approvals.js";
import { deviceRoutes, pairingClaimRoutes } from "./routes/devices.js";
import { terminalRoutes } from "./routes/terminals.js";
import { MOBILE_OFF_MESSAGE, type PairingCenter } from "../devices/pairing.js";
import type { ViewingRegistry } from "../notifications/viewing.js";
import type { TerminalSessions } from "../terminal/sessions.js";
import type { BrowserLogin } from "./browserLogin.js";
import { chatRoutes } from "./routes/chats.js";
import { databaseRoutes } from "./routes/databases.js";
import { githubRoutes } from "./routes/github.js";
import { ciRoutes } from "./routes/ci.js";
import { dockerRoutes } from "./routes/docker.js";
import { portsRoutes } from "./routes/ports.js";
import { filesRoutes } from "./routes/files.js";
import { gitRoutes } from "./routes/git.js";
import { groupRoutes } from "./routes/groups.js";
import { snippetRoutes } from "./routes/snippets.js";
import { trashRoutes } from "./routes/trash.js";
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
import { DEVICE_FORBIDDEN, DEVICE_READ_ONLY, MOBILE_OFF, type GitHubAccount, type ProviderId, type ServerHello, type ServerStatus } from "@shared/types";
import { API_MISMATCH_LABELS, API_VERSION, API_VERSION_HEADER, MIN_CLIENT_API_VERSION, type ApiMismatch } from "@shared/api/version";
import { createMiddleware } from "hono/factory";

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
  /** ワークツリーの実行環境（ポートの帯・組の名前） */
  worktreeEnvs: WorktreeEnvService;
  /** ポートを使っているプロセス（調べる・止める。実行が終わったときの見張り） */
  ports: PortWatch;
  /** スマホ連携のペアリング（使い捨ての番号・確かめを待っている頼み） */
  pairing: PairingCenter;
  /** いまだれが何を見ているか（通知を出すかの判断） */
  viewing: ViewingRegistry;
  /** ブラウザからこの Mac の画面として入る、一度だけ使えるログイン（npm run daemon が出す /login?code=） */
  browserLogin: BrowserLogin;
  /** gh に入っている GitHub のアカウント（設定の「GitHub」。テストでは差し替えて、gh を呼ばない。なければ gh auth status） */
  githubAccounts?: () => Promise<GitHubAccount[]>;
  /** Kickoff のゴミ箱（消したものを 3 日取っておき、元に戻せる。trash/service.ts） */
  trashBin: TrashService;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  /** 内蔵ターミナルのシェル（スマホは WebSocket でつなぐ = routes/terminals.ts） */
  terminals: TerminalSessions;
  /** tailscale のコマンドの場所（OS の口。設定の Tailscale Serve の案内。テストでは偽物） */
  tailscaleCli: () => string | null;
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

  // 版の互換: アプリが見出しで伝えた API の版が、本体の受ける下限より古ければ、決まった印で断る（認証より前。ペアリングの口も同じ）
  const checkClientVersion = createMiddleware(async (c, next) => {
    const given = c.req.header(API_VERSION_HEADER);
    if (given !== undefined && !(Number(given) >= MIN_CLIENT_API_VERSION)) {
      return c.json({ error: API_MISMATCH_LABELS.client_too_old, code: "client_too_old" satisfies ApiMismatch, api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION }, 426);
    }
    await next();
  });
  app.use("/api/*", checkClientVersion);
  app.use("/pairing/*", checkClientVersion);

  // スマホ連携のペアリング: まだトークンを持たない端末が、番号で頼んで結果を聞く口（認証の外。routes/devices.ts）
  pairingClaimRoutes(app, deps);

  // ブラウザからこの Mac の画面として入る（npm run daemon が出す一度だけの番号。本体のトークンの Cookie を置いて画面へ）
  app.get("/login", (c) => {
    if (!deps.browserLogin.consume(c.req.query("code") ?? "")) return c.text("ログインの番号が正しくないか、期限が切れています。npm run daemon を起動し直すと、新しい URL を出します", 401);
    setCookie(c, AUTH_COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return c.redirect("/");
  });

  // AI が返答に描いた図（SVG・HTML）を入れる枠のページ（認証の外。中身は画面が postMessage で渡すので、秘密は何も持たない）。
  // 画面の CSP を引き継がないよう別のページにし、図だけの CSP（決めた CDN のほかへは通信しない）を見出しで付ける。画面は sandbox="allow-scripts" の iframe で開く
  app.get("/visual-frame", (c) => {
    c.header("Content-Security-Policy", VISUAL_FRAME_CSP);
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    return c.html(VISUAL_FRAME_SHELL);
  });

  // 認証と呼び主: 本体のトークン（この Mac の画面の Cookie）ならこの Mac、端末のトークンならその端末（http/caller.ts）。
  // 端末は deviceAccess.ts に書いた口だけ使える（既定で閉じる。ほかは 403）
  app.use("/api/*", async (c, next) => {
    const given = [c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), getCookie(c, AUTH_COOKIE)].filter((t): t is string => Boolean(t));
    if (given.some((t) => tokenMatches(token, t))) {
      setCaller(c, { kind: "host" });
      return next();
    }
    const device = given.map((t) => store.devices.byTokenHash(hashToken(t))).find((d) => d !== null);
    if (!device) return c.json({ error: "unauthorized" }, 401);
    // スマホ連携がオフなら、つないだ端末からの頼みも断る（登録は残す。オンに戻せばそのまま使える）
    if (!store.settings.get().remote_enabled) return c.json({ error: MOBILE_OFF_MESSAGE, code: MOBILE_OFF }, 403);
    store.devices.touch(device.id);
    setCaller(c, { kind: "device", device });
    const use = deviceMayUse(c.req.method, c.req.path, device.access);
    if (use === "forbidden") return c.json({ error: "この操作は、この Mac の Kickoff からだけ使えます", code: DEVICE_FORBIDDEN }, 403);
    if (use === "read_only") return c.json({ error: "この端末は「見るだけ」です（Mac の Kickoff の設定の「スマホ連携」で変えられます）", code: DEVICE_READ_ONLY }, 403);
    return next();
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
      api_version: API_VERSION,
      min_client_api_version: MIN_CLIENT_API_VERSION,
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
  trashRoutes(app, deps);
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
  portsRoutes(app, deps);
  deviceRoutes(app, deps);
  terminalRoutes(app, deps);

  // ---- リアルタイム配信（SSE） ----
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      // 端末には、開いた口の知らせだけを届ける（deviceAccess.ts）。スマホ連携をオフにした・その端末を取り消したら、端末の知らせはそこで切る
      const caller = callerOf(c);
      const isDevice = caller.kind === "device";
      // 切断の知らせは、待つ前（最初の書き込みの前）に受け取れるようにしておく。こちらから切るときも同じ待ちを終える
      let finish = () => {};
      const closed = new Promise<void>((resolve) => {
        finish = resolve;
        stream.onAbort(resolve);
      });
      const unsubscribe = bus.subscribe((event) => {
        if (isDevice && event.type === "settings" && !event.settings.remote_enabled) return finish();
        if (caller.kind === "device" && event.type === "devices" && !store.devices.get(caller.device.id)) return finish();
        if (!isDevice || deviceMaySee(event)) void stream.writeSSE({ data: JSON.stringify(event) });
      });
      const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
      // つないだらすぐ hello（本体の版・API の版・本体の ID）を送る。何か書くまで応答ヘッダーが届かず、画面が「接続中」のままになるのも防ぐ
      const hello: ServerHello = { core_version: VERSION, api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: store.databaseId };
      await stream.writeSSE({ event: "hello", data: JSON.stringify(hello) });
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

