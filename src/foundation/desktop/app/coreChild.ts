// コアのプロセス 1 つ分: utilityProcess を fork し、RPC をつなぎ、init を送って ready / failed / exit を待つ（作り直しは coreProcess.ts）
import { utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import { sleep } from "@shared/foundation/time";
import type { CoreState } from "@shared/foundation/ipc";
import type { CoreEvents, CoreInit, CoreMethods, CoreReady, HostEvents, HostMethods, HostToCore, RecoveredReason } from "@/foundation/core/host/protocol";
import { RPC_TIMEOUTS, timeoutOf } from "@/foundation/core/host/protocol";
import type { RpcPort } from "@/foundation/core/host/ports";
import { createRpc, type CoreRpc } from "@/foundation/core/host/rpc";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { signalProcess } from "./processes";

/** 応答しないコアを SIGTERM で止めてから SIGKILL を送るまで */
const CORE_KILL_WAIT_MS = 3_000;

/** コア → メインの呼び出し（埋め込みブラウザ・キーチェーンの鍵）の中身。DB ワーカーは見張り役が持つ */
export type HostHandlers = Omit<HostMethods, "dbWorker.spawn" | "dbWorker.kill">;

/** 見張り役（coreProcess.ts）の起動の値 */
export interface CoreProcessOptions {
  /** ビルドの out/main/core.js */
  file: string;
  /** 起動の引数（コンパイルキャッシュの場所） */
  args: string[];
  /** DB ワーカー（out/main/dbWorker.js。作るのはメイン、話すのはコア） */
  dbWorkerFile: string;
  /** 起動の値（作り直すたびに作る。recoveredReason は前のコアの終わり方） */
  init: (recoveredReason: RecoveredReason) => CoreInit;
  handlers: HostHandlers;
  /** 様子が変わった（画面の帯・眠らせない・起動の記録） */
  onState: (state: CoreState) => void;
  /** 起動の記録に書く */
  log: (message: string) => void;
  /** プロセスの表と生き死に（落ちたときに止める子を確かめる・止める） */
  host: Pick<HostPlatform, "processTable" | "alive">;
}



/** utilityProcess の子を RpcPort の形に包む（メインの側。閉じた = 子が終わった） */
function childPort(child: UtilityProcess): RpcPort {
  return {
    post: (message, transfer) => child.postMessage(message, (transfer ?? []) as MessagePortMain[]),
    onMessage: (fn) => {
      const listener = (m: unknown) => fn(m, []);
      child.on("message", listener);
      return () => void child.off("message", listener);
    },
    onClose: (fn) => {
      child.once("exit", () => fn());
      return () => {};
    },
  };
}

export interface CoreChild {
  child: UtilityProcess;
  rpc: CoreRpc;
  /** ready を受けた（failed・起動の途中の exit なら失敗） */
  ready: Promise<CoreReady>;
  /** プロセスが終わった */
  exited: Promise<void>;
}

/** コアを fork する（handlers: コアから呼ばれる口。onExit: 終わった。afterReady は ready のあとに終わった = 落ちた・止めた） */
export function forkCore(opts: {
  file: string;
  args: string[];
  handlers: (child: UtilityProcess) => HostMethods;
  init: CoreInit;
  onExit: (code: number, afterReady: boolean) => void;
}): CoreChild {
  const child = utilityProcess.fork(opts.file, opts.args, {
    serviceName: "Kickoff Core",
    stdio: "inherit",
    env: process.env,
    execArgv: ["--disable-warning=ExperimentalWarning"],
  });
  const port = childPort(child);
  const rpc = createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(port, { timeoutOf: (method) => timeoutOf(RPC_TIMEOUTS, method), handlers: opts.handlers(child) });
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => (resolveExit = resolve));
  const ready = new Promise<CoreReady>((resolve, reject) => {
    let settled = false;
    port.onMessage((m) => {
      const msg = m as { t?: string; ready?: CoreReady; message?: string };
      if (settled) return;
      if (msg.t === "ready" && msg.ready) {
        settled = true;
        resolve(msg.ready);
      } else if (msg.t === "failed") {
        settled = true;
        reject(new Error(msg.message ?? "コアを起動できません"));
      }
    });
    child.once("exit", (code) => {
      resolveExit();
      const afterReady = settled;
      if (!settled) {
        settled = true;
        reject(new Error(`コアのプロセスが起動の途中で終わりました（終了コード ${code}）`));
      }
      opts.onExit(code, afterReady);
    });
    child.postMessage({ t: "init", init: opts.init } satisfies HostToCore);
  });
  return { child, rpc, ready, exited };
}

/** 動いているコアを止めて、終わるのを待つ（SIGTERM で終わらなければ SIGKILL） */
export async function killCore(child: UtilityProcess, exited: Promise<void>): Promise<void> {
  child.kill();
  const done = await Promise.race([exited.then(() => true), sleep(CORE_KILL_WAIT_MS).then(() => false)]);
  if (!done && child.pid) signalProcess({ pid: child.pid, group: false }, "SIGKILL");
  await exited;
}
