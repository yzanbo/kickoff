import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/visuals/visualDocument";
import { AUTH_COOKIE, tokenMatches } from "./auth";
import { callerOf, setCaller } from "./caller";
import { deviceMaySee, deviceMayUse } from "./deviceAccess";
import { errorMessage } from "@shared/foundation/errors";
import { errorResponse } from "./errorResponse";
import type { Bus } from "@/foundation/core/bus";
import type { AgentProvider } from "@/features/ai/core/providers/index";
import type { Store } from "@/foundation/core/db/store";
import type { ServiceUsageMonitor } from "@/features/ai/core/usage/services/index";
import type { UsageMonitor } from "@/features/ai/core/usage/planUsage";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { Runner } from "@/features/chat/core/runner";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { VoiceService } from "@/features/voice/core/service";
import type { NoteService } from "@/features/notes/core/notes";
import type { DatabaseService } from "@/features/database/core/service";
import type { GitHubService } from "@/features/github/core/service";
import type { CiService } from "@/features/github/core/ci";
import type { DockerService } from "@/features/docker/core/service";
import type { PortWatch } from "@/features/ports/core/watch";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { SessionsUsedElsewhere } from "@/features/chat/core/sessions/siblingSessions";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import type { TrashService } from "@/features/trash/core/service";
import type { RemoteImageService } from "@/features/remoteImages/core/service";
import { approvalRoutes } from "@/features/chat/core/routes/approvals";
import { deviceRoutes, pairingClaimRoutes } from "@/features/devices/core/routes/devices";
import { userViewRoutes } from "@/features/userView/core/routes/userView";
import { terminalRoutes } from "@/features/terminal/core/routes/terminals";
import { MOBILE_OFF_MESSAGE, type PairingCenter } from "@/features/devices/core/pairing";
import type { ViewingRegistry } from "@/features/notifications/core/viewing";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import type { BrowserLogin } from "./browserLogin";
import { chatRoutes } from "@/features/chat/core/routes/chats";
import { databaseRoutes } from "@/features/database/core/routes/databases";
import { githubRoutes } from "@/features/github/core/routes/github";
import { ciRoutes } from "@/features/github/core/routes/ci";
import { dockerRoutes } from "@/features/docker/core/routes/docker";
import { portsRoutes } from "@/features/ports/core/routes/ports";
import { filesRoutes } from "@/features/files/core/routes/files";
import { gitRoutes } from "@/features/git/core/routes/git";
import { groupRoutes } from "@/features/groups/core/routes/groups";
import { snippetRoutes } from "@/features/snippets/core/routes/snippets";
import { trashRoutes } from "@/features/trash/core/routes/trash";
import { noteRoutes } from "@/features/notes/core/routes/notes";
import { projectRoutes } from "@/features/projects/core/routes/projects";
import { providerRoutes } from "@/features/ai/core/routes/providers";
import { queueRoutes } from "@/features/chat/core/routes/queue";
import { settingsRoutes } from "@/features/settings/core/routes/settings";
import { turnRoutes } from "@/features/chat/core/routes/turns";
import { uploadRoutes } from "@/features/attachments/core/routes/uploads";
import { chatImageRoutes } from "@/features/remoteImages/core/routes/chatImages";
import { usageRoutes } from "@/features/ai/core/routes/usage";
import { voiceRoutes } from "@/features/voice/core/routes/voice";
import { worktreeRoutes } from "@/features/worktrees/core/routes/worktrees";
import { worktreePrRoutes } from "@/features/github/core/routes/worktreePrs";
import type { WorktreePrWatch } from "@/features/github/core/prWatch";
import type { HeadWatch } from "@/features/worktrees/core/headWatch";
import { DEVICE_FORBIDDEN, DEVICE_READ_ONLY, MOBILE_OFF, type GitHubAccount, type ProviderId, type ServerHello, type ServerStatus } from "@shared/types";
import { API_MISMATCH_LABELS, API_VERSION, API_VERSION_HEADER, MIN_CLIENT_API_VERSION, type ApiMismatch } from "@shared/foundation/api/version";
import { createMiddleware } from "hono/factory";
import { MCP_PATH, type McpToolHost } from "@/foundation/core/aiTools/host";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";
import { sseDataOf } from "./sseData";
import { isHashedAsset, rendererCacheControl } from "./rendererCache";
import { etag } from "hono/etag";

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
  /** プロジェクトのノート（保存先はプロジェクトの外） */
  notes: NoteService;
  /** ワークツリーの PR の見張り（マージ・マージせずに閉じたことの知らせ） */
  prWatch: WorktreePrWatch;
  /** ブランチの切り替え・ワークツリーの足し引きの見張り（一覧の API が見張りを一覧に合わせる） */
  headWatch: HeadWatch;
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
  /** チャット欄の外の画像（表示を許可したホストと、取ってきた画像の覚え） */
  remoteImages: RemoteImageService;
  /** ワークツリーの後始末（画面の「消す」と AI の finish_worktree。確かめ・控え・予約。worktrees/finish.ts） */
  worktreeFinisher: WorktreeFinisher;
  /** 利用者が見ているもの（この Mac の画面のウィンドウごとと、チャットごとの送ったときの様子。AI の get_user_view。userView/registry.ts） */
  userViews: UserViewRegistry;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（どのチャットも使っていない会話記録の一覧から除く。省けば調べない） */
  sessionsElsewhere?: SessionsUsedElsewhere;
  /** 内蔵ターミナルのシェル（スマホは WebSocket でつなぐ = routes/terminals.ts） */
  terminals: TerminalSessions;
  /** コアの MCP サーバー（AI の操作ツールを実行ごとの鍵で出す。/mcp/<サーバーの名前>） */
  mcpTools: McpToolHost;
  /** AI の API キー（暗号化して置く。置いたかだけを返す） */
  providerKeys: ProviderKeyVault;
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
 * Kickoff の HTTP API。デスクトップの画面とスマホのアプリが共通で使う。
 * 認証はトークン（Cookie または Authorization: Bearer）。
 */
export function createApp(deps: ServerDeps): Hono {
  const { store, bus, token, runner } = deps;
  const app = new Hono();

  // 詰まりの見張り（system/stallWatch.ts）: 頼みの最初の await までの同期の分に「http:<メソッド> <パス>」の名前を付ける（数字の段は :id）。
  // 中の SQL は別に名前が付く
  app.use("*", async (c, next) => {
    const start = syncStart();
    const done = next();
    noteSyncSince(start, () => `http:${c.req.method} ${c.req.path.replace(/\/\d+(?=\/|$)/g, "/:id")}`);
    await done;
  });

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

  // AI の操作ツールの MCP の口（コアの MCP サーバー。mcp/host.ts）。本体・端末のトークンではなく、1 回の実行ごとの鍵で受ける（その実行に決めたツールだけ）
  app.all(`${MCP_PATH}/:server`, (c) => deps.mcpTools.handle(c.req.param("server"), c.req.raw));

  // 認証と呼び主: 本体のトークン（この Mac の画面の Cookie）ならこの Mac、端末のトークンならその端末（http/caller.ts）。
  // 端末は deviceAccess.ts に書いた口だけ使える（既定で閉じる。ほかは 403）
  app.use("/api/*", async (c, next) => {
    const given = [c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), getCookie(c, AUTH_COOKIE)].filter((t): t is string => Boolean(t));
    if (given.some((t) => tokenMatches(token, t))) {
      setCaller(c, { kind: "host" });
      return next();
    }
    const device = given.map((t) => store.devices.byToken(t)).find((d) => d !== null);
    if (!device) return c.json({ error: "unauthorized" }, 401);
    // スマホ連携がオフなら、つないだ端末からの頼みも断る（登録は残す。オンに戻せばそのまま使える）
    if (!store.settings.get().remote_enabled) return c.json({ error: MOBILE_OFF_MESSAGE, code: MOBILE_OFF }, 403);
    store.devices.touch(device.id);
    setCaller(c, { kind: "device", deviceId: device.id, readOnly: device.access !== "full" });
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
  chatImageRoutes(app, deps);
  approvalRoutes(app, deps);
  providerRoutes(app, deps);
  usageRoutes(app, deps);
  gitRoutes(app, deps);
  filesRoutes(app, deps);
  worktreeRoutes(app, deps);
  worktreePrRoutes(app, deps);
  voiceRoutes(app, deps);
  noteRoutes(app, deps);
  databaseRoutes(app, deps);
  githubRoutes(app, deps);
  ciRoutes(app, deps);
  dockerRoutes(app, deps);
  portsRoutes(app, deps);
  deviceRoutes(app, deps);
  terminalRoutes(app, deps);
  userViewRoutes(app, deps);

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
        if (caller.kind === "device" && event.type === "devices" && !store.devices.get(caller.deviceId)) return finish();
        if (!isDevice || deviceMaySee(event)) {
          const start = syncStart();
          const data = sseDataOf(event);
          noteSyncSince(start, () => `sse:${event.type}`);
          void stream.writeSSE({ data });
        }
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
  if (deps.staticDir) {
    // 画面のファイルを読めなければ起動を失敗にする（黙って画面を配らないと、窓が真っ暗のまま理由が分からない）
    const indexHtml = readIndexHtml(deps.staticDir);
    const root = path.relative(process.cwd(), deps.staticDir);
    // /assets/ の下（名前に中身のハッシュが付く）は 1 年・変わらないとしてキャッシュさせ（起動・別ウィンドウのたびに JS を取り直してコンパイルし直さない）、
    // ほかは毎回問い合わせさせる（no-cache）。no-cache を外すと、serveStatic は Last-Modified だけを付けるので Chromium が経験則でキャッシュを
    // 新しいとみなし、アプリを入れ替えたあとの起動で古い index.html を問い合わせずに使う（新しいコアとかみ合わず、画面が真っ暗になることがあった）。
    // index.html には中身から作る ETag を付け、変わっていなければ 304（変われば新しい index.html が新しいハッシュの JS を読む。rendererCache.ts）
    app.use("/*", async (c, next) => {
      await next();
      if (c.res.ok || c.res.status === 304) c.res.headers.set("Cache-Control", rendererCacheControl(c.req.path));
    });
    // ETag は /assets/ の外だけ（大きな JS を読み直してハッシュを計算しない。asar の中のファイルの更新時刻はファイルごとでないので If-Modified-Since は使わない）
    const withEtag = etag();
    app.use("/*", (c, next) => (isHashedAsset(c.req.path) ? next() : withEtag(c, next)));
    app.use("/*", serveStatic({ root }));
    // SPA のため、未知のパスは index.html を返す。ただし拡張子のあるパス（/assets/… の JS・CSS など）は 404 にする
    // （HTML を JS として読み込ませて、原因の分からない失敗にしない）
    app.get("*", (c) => (path.extname(c.req.path) ? c.notFound() : c.html(indexHtml)));
  }

  return app;
}

/** 画面の index.html を読む（読めなければ、場所と理由の分かる文で投げる。コアの起動の失敗として画面の外に出る） */
export function readIndexHtml(staticDir: string): string {
  const file = path.join(staticDir, "index.html");
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`画面のファイル（${file}）を読めません: ${errorMessage(e)}`);
  }
}
