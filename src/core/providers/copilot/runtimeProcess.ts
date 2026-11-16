// Copilot のランタイム（SDK が stdio で起こす子プロセス）の pid を、コアのプロセスの持ち主（メインプロセス）に知らせる（system/childProcesses.ts。
// コアが落ちたら、メインが作り直す前に止める。Claude Code の spawnNotes.ts・codex app-server などの stdioRpc.ts と同じ）。
// 起動は SDK に任せたまま、start のあとに SDK が持つ子（型には出ていない `cliProcess`）を読む。なくなっても知らせが届かないだけで、実行は変わらない
import { reportChildProcess } from "../../system/childProcesses.js";

/** SDK のクライアントのうち、ここで読む所（子プロセスの pid と終わりの知らせ） */
interface RuntimeHolder {
  cliProcess?: { pid?: number; once(event: "exit", listener: () => void): unknown } | null;
}

/** start したクライアントのランタイムを知らせ、終わったら外す（同じ子を 2 回知らせない。返り値は知らせた pid） */
export function noteRuntimeProcess(client: unknown): number | null {
  const child = (client as RuntimeHolder | null)?.cliProcess;
  const pid = child?.pid;
  if (!child || typeof pid !== "number" || noted.has(child)) return null;
  noted.add(child);
  reportChildProcess({ pid, group: false, kind: "agent", state: "started" });
  child.once("exit", () => reportChildProcess({ pid, group: false, kind: "agent", state: "exited" }));
  return pid;
}

const noted = new WeakSet<object>();
