// ポートを使っているプロセスの取り決め（受け口は src/features/ports/core/routes/ports.ts。コマンドの全文を返し、プロセスを止められるので端末には開かない）
import { route, type Contract } from "@shared/foundation/contract";
import type { PortProcess, PortStopBody, PortStopResult } from "./types";

export const portsContract = {
  /** 調べる（窓を開いた・↻。調べたら SSE の ports_changed でほかの窓に知らせる）。cached = "1" は最後に調べた一覧（知らせを受けた・起動したとき） */
  "GET /api/ports": route<never, { processes: PortProcess[] }, { cached?: "0" | "1" }>(),
  /** 止める（SIGTERM。force なら SIGKILL）。少し待って終わったかを返す */
  "POST /api/ports/stop": route<PortStopBody, PortStopResult>(),
} as const satisfies Contract;
