// リアルタイム配信（SSE。GET /api/events）: Bus の知らせを流す。つないだらすぐ hello、25 秒ごとに ping
import { API_VERSION, MIN_CLIENT_API_VERSION } from "@shared/foundation/api/version";
import type { ServerHello } from "@shared/foundation/server";
import type { ServeHooks } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";
import type { Caller } from "./caller";
import type { SseHandler } from "./implement";
import { sseDataOf } from "./sseData";
import { sseStream } from "./sseStream";

/** 呼び主への知らせの流れ（端末には開いた口の知らせだけを届け、取り消した・スマホ連携をオフにしたらそこで切る） */
export function eventStream(k: Pick<Kernel, "bus" | "clock" | "paths">, version: string, hooks: Pick<ServeHooks, "deviceAuth" | "deviceMaySee">, caller: Caller): SseHandler {
  const { deviceAuth, deviceMaySee } = hooks;
  return sseStream(k.clock, async (stream, finish, send) => {
    const unsubscribe = k.bus.subscribe((event) => {
      if (caller.kind === "device") {
        if ((event.type === "settings" || event.type === "devices") && !deviceAuth?.alive(caller.deviceId)) return finish();
        if (!deviceMaySee(event)) return;
      }
      const start = syncStart();
      const data = sseDataOf(event);
      noteSyncSince(start, () => `sse:${event.type}`);
      send({ data });
    });
    // つないだらすぐ hello（本体の版・API の版・本体の ID）を送る。何か書くまで応答ヘッダーが届かず、画面が「接続中」のままになるのも防ぐ
    const hello: ServerHello = { core_version: version, api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: k.paths.databaseId };
    await stream.writeSSE({ event: "hello", data: JSON.stringify(hello) });
    return unsubscribe;
  });
}
