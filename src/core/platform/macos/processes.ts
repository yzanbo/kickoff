// macOS: プロセスの表（ps）・シグナル・アプリの本体（.app の束）
import { runCommand } from "../../system/exec.js";
import type { ProcessRow } from "../types.js";

/** ps の etime（[[日-]時:]分:秒）を秒にする（読めなければ null） */
export function parseEtime(etime: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(min) * 60 + Number(s);
}

/** `ps -A -o pid=,ppid=,etime=,command=` の出力を pid → 行 にする（読めない行は飛ばす） */
export function parsePs(out: string): Map<number, ProcessRow> {
  const rows = new Map<number, ProcessRow>();
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    // ps はコマンドの中の改行を \012 と書く（python -c の複数行など）。1 行に読み替える
    rows.set(pid, { pid, ppid: Number(m[2]), elapsed: parseEtime(m[3]), command: m[4].replace(/\\012/g, " ").replace(/\s+/g, " ").trim() });
  }
  return rows;
}

/** プロセスの表（ps） */
export const processTable = async (): Promise<Map<number, ProcessRow>> => parsePs(await runCommand("/bin/ps", ["-A", "-o", "pid=,ppid=,etime=,command="], { timeout: 5_000 }));

/** 実行ファイルのパスから .app の束のフォルダ（末尾の / まで。/A/Kickoff.app/Contents/MacOS/Kickoff → /A/Kickoff.app/。.app でなければ null） */
export function appBundleOf(execPath: string): string | null {
  const i = execPath.indexOf(".app/");
  return i < 0 ? null : execPath.slice(0, i + ".app/".length);
}

/** まだ動いているか（権限がないだけ（EPERM）なら、まだ動いている） */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}
