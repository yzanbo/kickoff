// 土台の口の取り決め（接続の状態と、知らせの流れ）。受け口は src/foundation/core/http/serverRoutes.ts
import { route, sse, type Contract } from "./contract";
import type { BusEvent } from "./events";
import type { ServerStatus } from "./server";

export const serverContract = {
  /** 画面の左下の「接続」の詳細（版・起動した時刻・待ち受け・作業中の数・スマホ連携・本体の ID・API の版） */
  "GET /api/status": route<never, ServerStatus>({ access: "device" }),
  /** リアルタイム配信（つないだらすぐ hello、25 秒ごとに ping。端末には開いた口の知らせだけ） */
  "GET /api/events": sse<BusEvent>({ access: "device" }),
} as const satisfies Contract;
