// Kickoff の HTTP API の土台。デスクトップの画面とスマホのアプリが共通で使う。認証はトークン（Cookie または Authorization: Bearer）。
// 登録の順: 詰まりの見張りの名前付け → 版の確かめ → 認証の外の口 → /login → /mcp → 認証 → 失敗の応答 → 状態 → 機能のルート → SSE → API の 404 → 画面の配信
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { API_MISMATCH_LABELS, API_VERSION, API_VERSION_HEADER, MIN_CLIENT_API_VERSION, type ApiMismatch } from "@shared/foundation/api/version";
import type { ServerStatus } from "@shared/foundation/server";
import { MCP_PATH } from "@/foundation/core/aiTools/host";
import { systemClock } from "@/foundation/core/clock";
import type { AssembledCore, Mountable } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";
import { authMiddleware, loginRoute, type BrowserLogin } from "./auth";
import { errorResponse } from "./errorResponse";
import { eventsRoute } from "./events";
import { serveRenderer } from "./static";

const STARTED_AT = systemClock.iso();
const VERSION = "0.1.0";

export interface HttpAppOptions {
  /** 本体のトークン */
  token: string;
  browserLogin: BrowserLogin;
  /** 待ち受けているアドレスとポート（接続の詳細の表示用。省けば頼みの URL のポート） */
  listen?: { host: string; port: number };
}

/** 組み立てた機能の受け口を、土台の口と決まった順に並べた Hono のアプリを作る */
export function createHttpApp(k: Pick<Kernel, "bus" | "clock" | "paths">, { features, hooks }: AssembledCore, opts: HttpAppOptions): Hono {
  const app = new Hono();
  const mount = (pick: (r: Mountable) => boolean) => {
    for (const f of features) for (const r of f.routes ?? []) if (pick(r)) r.legacy(app);
  };

  // 詰まりの見張り（system/stallWatch.ts）: 頼みの最初の await までの同期の分に「http:<メソッド> <パス>」の名前を付ける（数字の段は :id。中の SQL は別に名前が付く）
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

  // 認証の外の口（まだトークンを持たない端末のペアリング）とページ（図の枠など。中身を画面が postMessage で渡すので秘密を持たない）
  mount((r) => r.access === "public");
  for (const f of features) for (const [path, page] of Object.entries(f.pages ?? {})) app.get(path, page);

  // ブラウザからこの Mac の画面として入る（npm run daemon が出す一度だけの番号。本体のトークンの Cookie を置いて画面へ）
  loginRoute(app, opts.token, opts.browserLogin);

  // AI の操作ツールの MCP の口（aiTools/host.ts）。本体・端末のトークンではなく、1 回の実行ごとの鍵で受ける（その実行に決めたツールだけ）
  const mcp = hooks.mcp;
  if (mcp) app.all(`${MCP_PATH}/:server`, (c) => mcp.handle(c.req.param("server"), c.req.raw));

  app.use("/api/*", authMiddleware(opts.token, hooks.deviceAuth));

  // 失敗はここでまとめて応答にする（種類は errors.ts。知らない失敗だけ記録する）
  app.onError((err, c) => {
    const { status, body } = errorResponse(err);
    if (status === 500) console.error("[api]", err);
    return c.json(body, status);
  });

  // 画面の左下の「接続」の詳細
  app.get("/api/status", (c) => {
    const status: ServerStatus = {
      version: VERSION,
      started_at: STARTED_AT,
      host: opts.listen?.host ?? "127.0.0.1",
      port: opts.listen?.port ?? Number(new URL(c.req.url).port),
      ...hooks.status(),
      database_id: k.paths.databaseId,
      api_version: API_VERSION,
      min_client_api_version: MIN_CLIENT_API_VERSION,
    };
    return c.json(status);
  });

  // ---- 機能ごとの API（並べた機能の順。:id の引き当ては lookups.ts、失敗の種類は errors.ts） ----
  mount((r) => r.access !== "public");

  eventsRoute(app, k, VERSION, hooks.deviceAuth);

  // 知らない API は JSON の 404 にする（本番の画面の配信の「未知のパスは index.html」に落とすと、200 の HTML が返っていた）
  app.all("/api/*", (c) => c.json({ error: "API が見つかりません" }, 404));

  if (k.paths.staticDir) serveRenderer(app, k.paths.staticDir);
  return app;
}
