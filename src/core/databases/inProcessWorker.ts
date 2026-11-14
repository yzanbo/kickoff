// テストで DB ワーカーを同じプロセスで動かすつなぎ。ワーカーの中身（pg・mysql2 を読む）を import するので、
// メインプロセスが読む client.ts には置かない（起動のたびにドライバを読み込ませない）
import type { WorkerChannel } from "./client.js";
import type { WorkerEvent, WorkerResponse } from "./protocol.js";
import { macosShell } from "../platform/macos/shell.js";
import { createWorkerHandler, IDLE_SWEEP_MS } from "./worker/handler.js";
import { setShellPlatform } from "./worker/shell.js";

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
