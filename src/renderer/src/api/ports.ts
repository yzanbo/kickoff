import type { PortProcess, PortStopBody, PortStopResult } from "@shared/types";
import { request } from "./http";

/** ポートを使っているプロセス（コアの routes/ports.ts。この Mac のアプリの中だけ） */
export const portsApi = {
  /** 調べる（ほかの窓には SSE の ports_changed で届く）。cached = コアが最後に調べた一覧（知らせを受けた・起動したとき） */
  portProcesses: (cached = false) => request<{ processes: PortProcess[] }>("GET", cached ? "/api/ports?cached=1" : "/api/ports").then((r) => r.processes),
  /** 止める（SIGTERM。force なら SIGKILL）。少し待って終わったか */
  stopPortProcess: (body: PortStopBody) => request<PortStopResult>("POST", "/api/ports/stop", body),
};
