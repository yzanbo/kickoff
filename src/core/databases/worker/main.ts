// DB ワーカーの入口（コアが起動する別のプロセス。Electron のアプリではメインプロセスが utilityProcess で、単体のコア・テストでは
// child_process.fork ＋ tsx で起動する）。親とはメッセージだけでやり取りし（utilityProcess は process.parentPort、fork は IPC の process.send）、
// 親がいなくなったら閉じて終わる（utilityProcess は親が終わると Electron が止める）
import type { WorkerCancel, WorkerEvent, WorkerRequest, WorkerResponse } from "../protocol.js";
import { setChildReporter } from "./children.js";
import { createWorkerHandler } from "./handler.js";

type Message = WorkerRequest | WorkerCancel;
/** Electron の utilityProcess の中だけにある、親とのつなぎ（コアは Electron の型を読まないので、使う所だけの形にする） */
interface ParentPort {
  on(event: "message", fn: (e: { data: Message }) => void): void;
  postMessage(message: unknown): void;
}
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

const send = (message: WorkerResponse | WorkerEvent) => (parentPort ? parentPort.postMessage(message) : process.send?.(message));

// 流したコマンドの結果（準備の記録）と、起動した子のプロセスはコアに知らせる
setChildReporter(send);
const handler = createWorkerHandler(send);

const receive = (message: Message) => {
  if ("cancel" in message) {
    void handler.cancel(message.cancel);
    return;
  }
  void handler.handle(message).then(send);
};

if (parentPort) parentPort.on("message", (e) => receive(e.data));
else {
  process.on("message", receive);
  process.on("disconnect", () => {
    void handler.closeAll().finally(() => process.exit(0));
  });
}
