// リアルタイム配信（SSE。GET /api/events）: Bus の知らせを流す。つないだらすぐ hello、25 秒ごとに ping
import { API_VERSION, MIN_CLIENT_API_VERSION } from "@shared/foundation/api/version";
import type { ServerHello } from "@shared/foundation/server";
import type { Kernel } from "@/foundation/core/kernel";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";
import type { Caller } from "./caller";
import type { DeviceAuth } from "./auth";
import { deviceMaySee } from "./deviceAccess";
import type { SseHandler } from "./implement";
import { sseDataOf } from "./sseData";

const PING_MS = 25_000;

/** 呼び主への知らせの流れ（端末には開いた口の知らせだけを届け、取り消した・スマホ連携をオフにしたらそこで切る） */
export function eventStream(k: Pick<Kernel, "bus" | "clock" | "paths">, version: string, deviceAuth: DeviceAuth | undefined, caller: Caller): SseHandler {
  return async (stream) => {
    // 切断の知らせは、待つ前（最初の書き込みの前）に受け取れるようにしておく。こちらから切るときも同じ待ちを終える
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
      stream.onAbort(resolve);
    });
    const unsubscribe = k.bus.subscribe((event) => {
      if (caller.kind === "device") {
        if ((event.type === "settings" || event.type === "devices") && !deviceAuth?.alive(caller.deviceId)) return finish();
        if (!deviceMaySee(event)) return;
      }
      const start = syncStart();
      const data = sseDataOf(event);
      noteSyncSince(start, () => `sse:${event.type}`);
      void stream.writeSSE({ data });
    });
    const ping = k.clock.setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), PING_MS);
    // つないだらすぐ hello（本体の版・API の版・本体の ID）を送る。何か書くまで応答ヘッダーが届かず、画面が「接続中」のままになるのも防ぐ
    const hello: ServerHello = { core_version: version, api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: k.paths.databaseId };
    await stream.writeSSE({ event: "hello", data: JSON.stringify(hello) });
    await closed;
    k.clock.clearInterval(ping);
    unsubscribe();
  };
}
