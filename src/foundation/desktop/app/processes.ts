// メインがほかのプロセスを止める補助（SIGTERM → 待つ → 残れば SIGKILL）。生き死には土台の OS の口（HostPlatform.alive。権限がないだけ（EPERM）なら生きている）
import { sleep } from "@shared/foundation/time";
import type { HostPlatform } from "@/foundation/core/platform/types";

/** 止めるプロセス（group ならプロセスのまとまりごと） */
export interface StopTarget {
  pid: number;
  group: boolean;
}

/** シグナルを送る（もう終わっていれば何もしない） */
export function signalProcess(target: StopTarget, sig: NodeJS.Signals) {
  try {
    process.kill(target.group ? -target.pid : target.pid, sig);
  } catch {
    // もう終わっている
  }
}

/** SIGTERM を送り、waitMs まで終わるのを待つ（killAfter なら、残ったものに SIGKILL） */
export async function stopProcesses(targets: readonly StopTarget[], opts: { waitMs: number; killAfter: boolean }, host: Pick<HostPlatform, "alive">): Promise<void> {
  for (const t of targets) signalProcess(t, "SIGTERM");
  const deadline = Date.now() + opts.waitMs;
  while (targets.some((t) => host.alive(t.pid)) && Date.now() < deadline) await sleep(100);
  if (opts.killAfter) for (const t of targets) if (host.alive(t.pid)) signalProcess(t, "SIGKILL");
}
