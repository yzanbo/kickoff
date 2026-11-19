// 組み立てた機能を HTTP で出す: 受け口を登録し（http/app.ts）、待ち受けを始めて機能の start を呼ぶ。止めるときは決まった順に止める
import type { Hono } from "hono";
import type { AssembledCore, CoreFeature } from "@/foundation/core/feature";
import { closeKernel, type Kernel } from "@/foundation/core/kernel";
import { createHttpApp, type HttpApp } from "@/foundation/core/http/app";
import { BrowserLogin, loadOrCreateToken } from "@/foundation/core/http/auth";
import { startHttpServer, stopHttpServer } from "@/foundation/core/http/httpServer";

export interface ServedCore {
  app: Hono;
  /** 本体のトークン（保存先の token） */
  token: string;
  browserLogin: BrowserLogin;
  /** 止める（機能 → ためた途中の返答 → HTTP → DB） */
  close(): Promise<void>;
}

/** ルートを登録して待ち受けを始め、機能の start() を作った順に呼ぶ。待ち受けられなければ、機能と土台を閉じてから投げる */
export async function serveCore(k: Kernel, assembled: AssembledCore, opts: { listen: { host: string; port: number } }): Promise<ServedCore> {
  const token = loadOrCreateToken(k.paths.dataDir);
  const browserLogin = new BrowserLogin(k.clock);
  const { app } = createHttpApp(k, assembled, { token, browserLogin, listen: opts.listen });
  // ポートが使われているなどで待ち受けられなければ、作ったものと DB を閉じてから伝える
  const server = await startHttpServer(app, opts.listen).catch(async (e: unknown) => {
    await stopFeatures(k, assembled.features);
    closeKernel(k);
    throw e;
  });
  for (const f of assembled.features) f.start?.();
  return {
    app,
    token,
    browserLogin,
    close: async () => {
      await stopFeatures(k, assembled.features);
      // ためている途中の返答を、SSE を切る前に流す
      k.bus.flush();
      await stopHttpServer(server);
      closeKernel(k);
    },
  };
}

/** テスト用: 待ち受けずに Hono のアプリと登録した受け口だけ作る（start() は呼ばない） */
export function appOf(k: Pick<Kernel, "bus" | "clock" | "paths" | "workplace">, assembled: AssembledCore, opts: { token: string; browserLogin?: BrowserLogin }): HttpApp {
  return createHttpApp(k, assembled, { token: opts.token, browserLogin: opts.browserLogin ?? new BrowserLogin(k.clock) });
}

/** 機能を止める順: stopPhase が "first" の機能を並べた順に（通知 → エージェント）→ 流れ続けている外部コマンド → 残りの機能を作った順の逆に */
export async function stopFeatures(k: Pick<Kernel, "exec">, features: readonly CoreFeature[]): Promise<void> {
  for (const f of features.filter((x) => x.stopPhase === "first")) await f.stop?.();
  k.exec.stopAllStreams();
  for (const f of features.filter((x) => x.stopPhase !== "first").reverse()) await f.stop?.();
}
