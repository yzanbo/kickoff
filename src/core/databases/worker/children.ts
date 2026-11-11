// DB ワーカーが起動する子のプロセス（ssh・シェル）の起動と知らせ。子は自分のプロセスグループで起動し（detached）、
// 起動したこと・終わったことをコアに知らせる（コアがワーカーを止めるとき、残った子もグループごと止めるため。protocol.ts の ChildProcessEvent）
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { ChildProcessEvent } from "../protocol.js";

let report: (event: ChildProcessEvent) => void = () => {};

/** 知らせる先（ワーカーの入口がコアへ送る関数。テストの同じプロセスのワーカーでは何もしない） */
export function setChildReporter(fn: (event: ChildProcessEvent) => void) {
  report = fn;
}

/** 子のプロセスを自分のプロセスグループで起動して、コアに知らせる */
export function spawnTracked(command: string, args: string[], options: SpawnOptions): ChildProcess {
  const proc = spawn(command, args, { ...options, detached: true });
  const pid = proc.pid;
  if (pid) {
    report({ event: "child", pid, alive: true });
    proc.once("exit", () => report({ event: "child", pid, alive: false }));
  }
  return proc;
}
