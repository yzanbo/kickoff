// macOS の拒否ログ。外部へ出す前に構造化し、OS のログ本文・パス・コマンドラインは捨てる
import { runCommand } from "@/foundation/core/system/exec";
import type { DiagnosticProcess, SandboxDenial, SandboxDiagnosticsPlatform } from "./sandboxDiagnosticsPlatform";
import { SANDBOX_LOG_PREDICATE, watchSandboxLog } from "./macosSandboxLogStream";

/** コマンドラインを取らず、起動時刻で PID の再利用を見分ける */
export function diagnosticProcesses(output: string): DiagnosticProcess[] {
  const rows: DiagnosticProcess[] = [];
  for (const line of output.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s*$/.exec(line);
    if (!m) continue;
    const startedAt = Date.parse(m[3]);
    if (Number.isFinite(startedAt)) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), startedAt });
  }
  return rows;
}

/** ndjson の Sandbox: actor(pid) deny(...) だけを読む。記録の processID は kernel の PID なので使わない */
export function sandboxDenials(output: string): SandboxDenial[] {
  const entries: SandboxDenial[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== "object") continue;
    const { eventMessage, timestamp, processImagePath } = row as Record<string, unknown>;
    // 利用者のアプリが書いた、同じ形のログは信用しない
    if (processImagePath !== "/kernel" && processImagePath !== "/usr/libexec/sandboxd") continue;
    if (typeof eventMessage !== "string" || typeof timestamp !== "string") continue;
    const m = /^Sandbox: [^\r\n()]{1,128}\((\d+)\) deny\(\d+\) ([a-z][a-z0-9-]{0,63})(?: (.*))?$/.exec(eventMessage);
    const at = Date.parse(timestamp);
    if (!m || !Number.isFinite(at)) continue;
    entries.push({ timestamp: at, pid: Number(m[1]), operation: m[2], resource: m[2] === "mach-lookup" && m[3] === "com.apple.FSEvents" ? "com.apple.FSEvents" : "<非表示>" });
  }
  return entries;
}

/** log の日時は UTC のオフセット付き（秒未満は、返ってから時刻で絞る） */
const logDate = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+0000");

export const macosSandboxDiagnostics: SandboxDiagnosticsPlatform = {
  watch: (signal, entry, failed) => watchSandboxLog(signal, sandboxDenials, entry, failed),
  processes: async (signal) => diagnosticProcesses(await runCommand("/bin/ps", ["-A", "-o", "pid=,ppid=,lstart="], { timeout: 2000, maxBuffer: 1024 * 1024, env: { ...process.env, LC_ALL: "C" }, signal })),
  denials: async (start, end, signal) => {
    // 呼び出し側でも制限するが、OS の口でも最大 2 分。文字列を差し込める引数はない
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 120_000) throw new Error("診断の時間範囲が不正です");
    const output = await runCommand("/usr/bin/log", ["show", "--style", "ndjson", "--info", "--debug", "--start", logDate(start), "--end", logDate(end + 1000), "--predicate", SANDBOX_LOG_PREDICATE], { timeout: 5000, maxBuffer: 1024 * 1024, signal });
    return sandboxDenials(output).filter((e) => e.timestamp >= start && e.timestamp <= end);
  },
};
