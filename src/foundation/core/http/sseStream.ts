// 知らせの流れ（SSE）の受け口の芯: 切れるまで待ち、そのあいだ 25 秒ごとに ping を送る（途中の仕掛けに切られないように）
import type { Clock } from "@/foundation/core/clock";
import type { SseHandler } from "./implement";

/** ping の間隔 */
const PING_MS = 25_000;

type SseStreamApi = Parameters<SseHandler>[0];

/**
 * open で流し始め（戻した関数は切れたあとの後始末）、切れるまで待つ。finish を呼ぶとこちらから切る。
 * 切断の知らせは最初の書き込みの前から受け取る
 */
export function sseStream(clock: Pick<Clock, "setInterval" | "clearInterval">, open: (stream: SseStreamApi, finish: () => void) => Promise<(() => void) | void> | (() => void) | void): SseHandler {
  return async (stream) => {
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
      stream.onAbort(resolve);
    });
    const ping = clock.setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), PING_MS);
    const cleanup = await open(stream, finish);
    await closed;
    clock.clearInterval(ping);
    cleanup?.();
  };
}
