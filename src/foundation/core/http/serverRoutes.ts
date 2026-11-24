// 土台の口（@shared/foundation/serverContract.ts）の受け口: 接続の状態（/api/status）と知らせの流れ（/api/events）
import { API_VERSION, MIN_CLIENT_API_VERSION } from "@shared/foundation/api/version";
import { serverContract } from "@shared/foundation/serverContract";
import type { ServeHooks } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { eventStream } from "./events";
import { implement, type ImplementedRoutes } from "./implement";

export interface ServerRouteOptions {
  version: string;
  startedAt: string;
  /** 待ち受けているアドレスとポート（省けば頼みの URL のポート） */
  listen?: { host: string; port: number };
}

export function serverRoutes(k: Pick<Kernel, "bus" | "clock" | "paths">, hooks: ServeHooks, opts: ServerRouteOptions): ImplementedRoutes {
  return implement(serverContract, {
    context: {},
    "GET /api/status": {
      run: ({ raw }) => ({
        version: opts.version,
        started_at: opts.startedAt,
        host: opts.listen?.host ?? "127.0.0.1",
        port: opts.listen?.port ?? Number(new URL(raw.req.url).port),
        ...hooks.status(),
        database_id: k.paths.databaseId,
        api_version: API_VERSION,
        min_client_api_version: MIN_CLIENT_API_VERSION,
      }),
    },
    "GET /api/events": { run: ({ caller }) => eventStream(k, opts.version, hooks, caller) },
  });
}
