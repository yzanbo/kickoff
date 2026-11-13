import type { PortProcess, PortStopBody, PortStopResult } from "@shared/types";
import { request } from "./http";

/** ポートを使っているプロセス（コアの routes/ports.ts。この Mac のアプリの中だけ） */
export const portsApi = {
  /** 調べる（調べた一覧は SSE の ports でもほかの窓に届く） */
  portProcesses: () => request<{ processes: PortProcess[] }>("GET", "/api/ports").then((r) => r.processes),
  /** 止める（SIGTERM。force なら SIGKILL）。少し待って終わったか */
  stopPortProcess: (body: PortStopBody) => request<PortStopResult>("POST", "/api/ports/stop", body),
};
