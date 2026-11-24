import type { HostPlatform, ProcessRow } from "@/foundation/core/platform/types";
import type { DesktopPlatform } from "@/foundation/desktop/platform/types";
import { stopProcesses } from "./processes";

/**
 * プロセスの表から、root の子孫のうち、Electron のメインプロセス（isMain。OS の口の isDevElectronMain）の pid を返す。
 * 内蔵ターミナルやエージェントの実行から起動した開発中の Electron アプリが当たる
 */
export function descendantElectronMains(table: ReadonlyMap<number, ProcessRow>, root: number, isMain: (command: string) => boolean): number[] {
  const children = new Map<number, ProcessRow[]>();
  for (const row of table.values()) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]);
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (isMain(child.command)) found.push(child.pid);
      queue.push(child.pid);
    }
  }
  return found;
}

/**
 * このアプリから起動された Electron のアプリ（製品版の Kickoff の内蔵ターミナル・エージェントから起動した Kickoff Dev など）を、
 * メインプロセスにだけ SIGTERM を送って止め、終わるのを待つ（timeoutMs まで）。
 * ターミナルやエージェントを先に止めると、Helper まで一緒にいきなり止められ、開発版の localStorage が消えることがあるため
 */
export async function stopChildElectronApps(timeoutMs: number, host: Pick<HostPlatform, "processTable" | "alive">, desktop: Pick<DesktopPlatform, "isDevElectronMain">): Promise<void> {
  let pids: number[];
  try {
    pids = descendantElectronMains(await host.processTable(), process.pid, desktop.isDevElectronMain);
  } catch {
    return;
  }
  await stopProcesses(
    pids.map((pid) => ({ pid, group: false })),
    { waitMs: timeoutMs, killAfter: false },
    host,
  );
}
