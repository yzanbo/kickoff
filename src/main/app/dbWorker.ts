// DB ワーカー（コアの DB クライアントが DB に触る別のプロセス）を Electron の utilityProcess で起動して、コアに渡すつなぎを作る。
// 前は自分の実行ファイルを ELECTRON_RUN_AS_NODE で Node として fork していたが、製品版は Electron の fuses で RunAsNode を切る
// （AI が Bash から Kickoff 本人として JavaScript を動かし、キーチェーンの鍵を受け取れないように）ので使えない
import { utilityProcess } from "electron";
import type { WorkerChannel } from "../../core/databases/client.js";
import type { WorkerCancel, WorkerEvent, WorkerRequest, WorkerResponse } from "../../core/databases/protocol.js";

/** utilityProcess で起動する（コアが初めて DB を使うときに呼ぶ） */
export function utilityWorker(file: string): WorkerChannel {
  const child = utilityProcess.fork(file, [], {
    serviceName: "Kickoff DB Worker",
    execArgv: ["--disable-warning=ExperimentalWarning"],
    stdio: "inherit",
  });
  let killed = false;
  return {
    send: (message: WorkerRequest | WorkerCancel) => child.postMessage(message),
    onMessage: (fn) => child.on("message", (m: WorkerResponse | WorkerEvent) => fn(m)),
    onExit: (fn) => {
      child.on("exit", (code) => !killed && fn(`終了コード ${code}`));
      child.on("error", (type, location) => !killed && fn(`${type}${location ? ` (${location})` : ""}`));
    },
    kill: () => {
      killed = true;
      // JS の受け口は使わない（SQLite の文を流している間は動けず、止められなくなる）。OS が SIGTERM で止める。
      // ワーカーが起動した ssh・シェルは、コアの DbWorkerClient が知らせで覚えていて、別に止める
      child.kill();
    },
  };
}
