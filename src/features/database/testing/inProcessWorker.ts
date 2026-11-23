// テストで DB ワーカーを同じプロセスで動かすつなぎ。ワーカーの中身（pg・mysql2 を読む）を import するので、
// コアが読む core/workerClient.ts には置かない（起動のたびにドライバを読み込ませない）
import type { WorkerChannel } from "@/features/database/core/index";
import type { WorkerEvent, WorkerResponse } from "@shared/database/workerProtocol";
import { macosShell } from "@/foundation/core/platform/macos/shell";
import { createWorkerHandler, IDLE_SWEEP_MS } from "@/features/database/worker/handler";
import { setShellPlatform } from "@/features/database/worker/shell";

/** 同じプロセスで動かす（テスト用。本物のワーカーと同じ中身を使う） */
export function inProcessWorker(): WorkerChannel {
  setShellPlatform(macosShell);
  let listener: (res: WorkerResponse | WorkerEvent) => void = () => {};
  const handler = createWorkerHandler((event) => listener(event));
  const sweep = setInterval(() => void handler.closeIdle(), IDLE_SWEEP_MS);
  sweep.unref();
  return {
    send: (message) => {
      if ("cancel" in message) void handler.cancel(message.cancel);
      else void handler.handle(message).then((res) => listener(res));
    },
    onMessage: (fn) => (listener = fn),
    onExit: () => {},
    kill: () => {
      clearInterval(sweep);
      void handler.closeAll();
    },
  };
}
