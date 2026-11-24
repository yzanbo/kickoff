// DB ワーカー（メインが作り、コアと MessagePort で直結する別のプロセス）の起動と停止
import { MessageChannelMain, utilityProcess, type UtilityProcess } from "electron";
import type { HostToCore } from "@/foundation/core/host/protocol";

export class DbWorkerPool {
  private readonly workers = new Map<number, UtilityProcess>();
  private nextId = 1;

  /** file: ビルドの out/main/dbWorker.js。onExit: ワーカーが自分で終わった（止めたものは知らせない） */
  constructor(
    private readonly file: string,
    private readonly onExit: (workerId: number, reason: string) => void,
  ) {}

  /** ワーカーを作り、コアと直結する MessagePort を両方に渡す（番号を返す） */
  spawn(core: UtilityProcess, env: Record<string, string>): number {
    const workerId = this.nextId++;
    const worker = utilityProcess.fork(this.file, [], { serviceName: "Kickoff DB Worker", execArgv: ["--disable-warning=ExperimentalWarning"], stdio: "inherit", env });
    this.workers.set(workerId, worker);
    const { port1, port2 } = new MessageChannelMain();
    worker.postMessage({ t: "port" }, [port1]);
    core.postMessage({ t: "port", purpose: "dbWorker", workerId } satisfies HostToCore, [port2]);
    const exit = (reason: string) => {
      if (!this.workers.has(workerId)) return;
      this.workers.delete(workerId);
      this.onExit(workerId, reason);
    };
    worker.once("exit", (code) => exit(`終了コード ${code}`));
    worker.on("error", (type, location) => exit(`${type}${location ? ` (${location})` : ""}`));
    return workerId;
  }

  /** JS の受け口は使わない（SQLite の文を流している間は動けない）。OS が SIGTERM で止める */
  kill(workerId: number) {
    const worker = this.workers.get(workerId);
    this.workers.delete(workerId);
    worker?.kill();
  }

  killAll() {
    for (const id of [...this.workers.keys()]) this.kill(id);
  }

  /** 動いているワーカーの pid（落ちたあと、止める子の親として確かめる） */
  pids(): number[] {
    return [...this.workers.values()].map((w) => w.pid).filter((p): p is number => typeof p === "number");
  }
}
