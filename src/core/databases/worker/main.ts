// DB ワーカーの入口（コアが起動する別のプロセス。Electron のアプリではメインプロセスが utilityProcess で、単体のコア・テストでは
// child_process.fork ＋ tsx で起動する）。親とはメッセージだけでやり取りし（utilityProcess は process.parentPort、fork は IPC の process.send）、
// 親がいなくなったら閉じて終わる（utilityProcess は親が終わると Electron が止める）。
// Electron のアプリでは、作るのはメインプロセスで、話すのはコアのプロセス: 最初に parentPort に
// { t: "port" } と MessagePort が届いたら、以後はその口で受け・送る（SQL の結果をメインプロセスに通さない）
import type { WorkerCancel, WorkerEvent, WorkerRequest, WorkerResponse } from "../protocol.js";
import { macosShell } from "../../platform/macos/shell.js";
import { setChildReporter } from "./children.js";
import { createWorkerHandler, IDLE_SWEEP_MS } from "./handler.js";
import { setShellPlatform } from "./shell.js";

type Message = WorkerRequest | WorkerCancel;
/** Electron の utilityProcess の中だけにある、親とのつなぎ（コアは Electron の型を読まないので、使う所だけの形にする） */
interface ParentPort {
  on(event: "message", fn: (e: { data: Message | { t: "port" }; ports?: ParentPort[] }) => void): void;
  postMessage(message: unknown): void;
  start?(): void;
}
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
/** コアと直接つないだ口（メインプロセスが作って渡す。届くまでは parentPort） */
let corePort: ParentPort | null = null;

const send = (message: WorkerResponse | WorkerEvent) => (corePort ? corePort.postMessage(message) : parentPort ? parentPort.postMessage(message) : process.send?.(message));

// この OS のシェルの口（ワーカーは口を受け取れないので、ここで選ぶ。いまは macOS だけ。ほかの OS を足すときは、ここと src/main/platform/index.ts で選び分ける）
setShellPlatform(macosShell);
// 流したコマンドの結果（準備の記録）と、起動した子のプロセスはコアに知らせる
setChildReporter(send);
const handler = createWorkerHandler(send);
// 10 分使っていない接続（とトンネル）を閉じる。1 分ごとに見る（プロセスを生かし続けない）
setInterval(() => void handler.closeIdle(), IDLE_SWEEP_MS).unref();

const receive = (message: Message) => {
  if ("cancel" in message) {
    void handler.cancel(message.cancel);
    return;
  }
  void handler.handle(message).then(send);
};

if (parentPort) {
  parentPort.on("message", (e) => {
    const port = e.ports?.[0];
    if ("t" in e.data && e.data.t === "port" && port) {
      corePort = port;
      port.on("message", (m) => receive(m.data as Message));
      port.start?.();
      return;
    }
    receive(e.data as Message);
  });
}
else {
  process.on("message", receive);
  process.on("disconnect", () => {
    void handler.closeAll().finally(() => process.exit(0));
  });
}
