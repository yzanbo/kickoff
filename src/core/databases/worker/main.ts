// DB ワーカーの入口（コアが child_process.fork で起動する別のプロセス。Electron では ELECTRON_RUN_AS_NODE=1、単体のコア・テストでは tsx）。
// 親とは IPC のメッセージだけでやり取りし、親がいなくなったら閉じて終わる
import type { WorkerCancel, WorkerRequest } from "../protocol.js";
import { createWorkerHandler } from "./handler.js";

const handler = createWorkerHandler();

process.on("message", (message: WorkerRequest | WorkerCancel) => {
  if ("cancel" in message) {
    void handler.cancel(message.cancel);
    return;
  }
  void handler.handle(message).then((res) => process.send?.(res));
});

process.on("disconnect", () => {
  void handler.closeAll().finally(() => process.exit(0));
});
