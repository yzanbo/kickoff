// コアが起こした子プロセス（エージェントの CLI・DB ワーカーが起動した ssh と準備のコマンド）を、コアのプロセスの持ち主に知らせる口。
// コアが落ちると子は launchd に引き取られて親子の表からたどれず、DB ワーカーの子の pid はコアのメモリにしかないので、
// メインプロセスが覚えておき、作り直す前に止める。
// 知らせる先はコアのプロセスの入口（host/run.ts）が startCore({ onChildProcess }) で渡す。単体のコア・テストでは誰も受けない
import type { ChildProcessNote } from "@/foundation/core/host/protocol";

let reporter: ((note: ChildProcessNote) => void) | null = null;

/** 知らせる先を決める（startCore が受けた口。閉じるときは null） */
export function setChildProcessReporter(fn: ((note: ChildProcessNote) => void) | null): void {
  reporter = fn;
}

/** 子プロセスを起こした・終わった（知らせる先がなければ何もしない） */
export function reportChildProcess(note: ChildProcessNote): void {
  try {
    reporter?.(note);
  } catch {
    // 知らせられなくても子は動かす
  }
}
