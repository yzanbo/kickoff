// 知らせの流れ（SSE）の受け口の芯: 切れるまで待ち、そのあいだ 25 秒ごとに ping を送る（途中の仕掛けに切られないように）
import type { Clock } from "@/foundation/core/clock";
import type { SseHandler } from "./implement";

/** ping の間隔 */
const PING_MS = 25_000;

/** 相手が読まずにたまった分の上限（文字数。超えたら切る。遅い相手・止まった相手の分がメモリにたまり続けないように。切れた画面はつなぎ直して読み直す） */
export const SSE_BACKLOG_LIMIT = 16 * 1024 * 1024;

type SseStreamApi = Parameters<SseHandler>[0];
type SseMessage = Parameters<SseStreamApi["writeSSE"]>[0];

/** 1 通を送る（待たない。たまりすぎたら切る） */
export type SseSend = (message: SseMessage) => void;

/**
 * 書き込みを待たずに送り、まだ相手に渡っていない分を数える。上限を超えたら onOverflow を 1 回呼び、それより後は書かない。
 * 書き込みの約束は、相手が読んで次を受けられるまで終わらない（流れの背圧）ので、終わっていない分がたまった分になる
 */
export function boundedWriter(write: (message: SseMessage) => Promise<unknown>, onOverflow: () => void, limit = SSE_BACKLOG_LIMIT): SseSend {
  let backlog = 0;
  let overflowed = false;
  return (message) => {
    if (overflowed) return;
    const size = typeof message.data === "string" ? message.data.length : 0;
    if (backlog + size > limit) {
      overflowed = true;
      onOverflow();
      return;
    }
    backlog += size;
    void write(message).finally(() => {
      backlog -= size;
    });
  };
}

/**
 * open で流し始め（戻した関数は切れたあとの後始末）、切れるまで待つ。finish を呼ぶとこちらから切る。知らせは send で送る（たまりすぎたら切る）。
 * 切断の知らせは最初の書き込みの前から受け取る
 */
export function sseStream(
  clock: Pick<Clock, "setInterval" | "clearInterval">,
  open: (stream: SseStreamApi, finish: () => void, send: SseSend) => Promise<(() => void) | void> | (() => void) | void,
): SseHandler {
  return async (stream) => {
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
      finish = resolve;
      stream.onAbort(resolve);
    });
    const send = boundedWriter((message) => stream.writeSSE(message), () => finish());
    const ping = clock.setInterval(() => send({ event: "ping", data: "" }), PING_MS);
    const cleanup = await open(stream, () => finish(), send);
    await closed;
    clock.clearInterval(ping);
    cleanup?.();
  };
}
