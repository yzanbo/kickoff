import { execFileAsync } from "../../core/system/exec.js";

/** Electron の開発用の実行ファイル（npm run dev で動く Kickoff Dev など。Helper のプロセスは含まない） */
const ELECTRON_MAIN = /\/Electron\.app\/Contents\/MacOS\/Electron(\s|$)/;

/**
 * ps -axo pid=,ppid=,command= の出力から、root の子孫のうち、Electron のメインプロセスの pid を返す。
 * 内蔵ターミナルやエージェントの実行から起動した開発中の Electron アプリが当たる
 */
export function descendantElectronMains(psOutput: string, root: number): number[] {
  const children = new Map<number, { pid: number; command: string }[]>();
  for (const line of psOutput.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const [pid, ppid, command] = [Number(m[1]), Number(m[2]), m[3]];
    children.set(ppid, [...(children.get(ppid) ?? []), { pid, command }]);
  }
  const found: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (ELECTRON_MAIN.test(child.command)) found.push(child.pid);
      queue.push(child.pid);
    }
  }
  return found;
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * このアプリから起動された Electron のアプリ（製品版の Kickoff の内蔵ターミナル・エージェントから起動した Kickoff Dev など）を、
 * メインプロセスにだけ SIGTERM を送って止め、終わるのを待つ（timeoutMs まで）。
 * ターミナルやエージェントを先に止めると、Helper まで一緒にいきなり止められ、開発版の localStorage が消えることがあるため
 */
export async function stopChildElectronApps(timeoutMs: number): Promise<void> {
  let pids: number[];
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
    pids = descendantElectronMains(stdout, process.pid);
  } catch {
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // すでに終わっている
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (pids.some(isAlive) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
}
