// 生のログはメモリで 1 行ずつ構造化して捨てる。診断の終了・時間切れ・コア終了ですべて止める
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { reportChildProcess } from "@/foundation/core/system/childProcesses";
import type { SandboxDenial, SandboxLogFailure } from "./sandboxDiagnosticsPlatform";

/** macOS の OS 発信の拒否だけ（AI が predicate を指定する口は作らない） */
export const SANDBOX_LOG_PREDICATE = '(process == "kernel" OR process == "sandboxd") AND eventMessage BEGINSWITH "Sandbox: " AND eventMessage CONTAINS " deny("';

/** OS の拒否のログを流れているまま読む（保存済みのログの log show だけでは拒否が取れない。--type log・--no-backtrace は外さない = 外すと余分なイベントとバックトレースで出力の上限に達する） */
export async function watchSandboxLog(
  signal: AbortSignal,
  parse: (line: string) => SandboxDenial[],
  entry: (entry: SandboxDenial) => void,
  failed: (reason: SandboxLogFailure) => void,
  spawnProcess: typeof spawn = spawn,
): Promise<() => Promise<void>> {
  if (signal.aborted) throw new Error("診断は終了しました");
  const child = spawnProcess("/usr/bin/log", ["stream", "--style", "ndjson", "--type", "log", "--no-backtrace", "--level", "debug", "--timeout", "2m", "--predicate", SANDBOX_LOG_PREDICATE], { stdio: ["ignore", "pipe", "pipe"] });
  const pid = child.pid;
  if (pid !== undefined) reportChildProcess({ pid, group: false, kind: "agent", state: "started" });
  let stopping = false;
  let closed = false;
  let bytes = 0;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  const lines = createInterface({ input: child.stdout });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (closed) return;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, 1000);
    killTimer.unref?.();
  };
  const failure = (reason: SandboxLogFailure) => { if (!stopping) { failed(reason); stop(); } };
  // 標準エラーの本文をエージェントやアプリのログへ出さない
  child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) failure("output_limit"); });
  child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) failure("output_limit"); });
  lines.on("line", (line) => {
    if (stopping || !line.trim() || line.startsWith("Filtering the log data using ")) return;
    try { for (const value of parse(line)) entry(value); } catch { failure("format_unsupported"); }
  });
  const done = new Promise<void>((resolve) => {
    child.once("error", () => failure("spawn_failed"));
    child.once("close", () => {
      closed = true;
      if (killTimer) clearTimeout(killTimer);
      if (startupTimer) clearTimeout(startupTimer);
      if (!stopping) failed("process_exit");
      signal.removeEventListener("abort", stop);
      lines.close();
      if (pid !== undefined) reportChildProcess({ pid, group: false, kind: "agent", state: "exited" });
      resolve();
    });
  });
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  // 起動直後の「Cannot run while sandboxed」などを開始の失敗として拾う
  await Promise.race([done, new Promise<void>((resolve) => { startupTimer = setTimeout(resolve, 200); startupTimer.unref?.(); })]);
  if (closed || stopping) { await done; throw new Error("OS の拒否ログを読み取れません"); }
  return async () => {
    stop();
    await done;
  };
}
