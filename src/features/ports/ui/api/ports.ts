import type { PortStopBody } from "@shared/ports/types";
import { portsContract } from "@shared/ports/contract";
import { client } from "@/foundation/ui/api/client";

/** ポートを使っているプロセスの呼び手（取り決めは @shared/ports/contract.ts） */
const ports = client(portsContract);

/** ポートを使っているプロセス（この Mac のアプリの中だけ） */
export const portsApi = {
  /** 調べる（ほかの窓には SSE の ports_changed で届く）。cached = コアが最後に調べた一覧（知らせを受けた・起動したとき） */
  portProcesses: (cached = false) => ports("GET /api/ports", { query: cached ? { cached: "1" } : {} }).then((r) => r.processes),
  /** 止める（SIGTERM。force なら SIGKILL）。少し待って終わったか */
  stopPortProcess: (body: PortStopBody) => ports("POST /api/ports/stop", { body }),
};
