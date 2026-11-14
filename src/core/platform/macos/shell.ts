// macOS の DB ワーカーの口（ShellPlatform）: ログインシェル（$SHELL -l -c）と、ps で読むプロセスの親子
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { ShellPlatform } from "../types.js";

/** ログインシェル（$SHELL。なければ zsh） */
const loginShellFile = () => (process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : "/bin/zsh");

/** ps の pid・ppid の行を、親 → 子の並びにする */
export function parseChildren(ps: string): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const line of ps.split("\n")) {
    const [p, pp] = line.trim().split(/\s+/).map(Number);
    if (p && pp) children.set(pp, [...(children.get(pp) ?? []), p]);
  }
  return children;
}

export const macosShell: ShellPlatform = {
  loginShell: (command) => ({ file: loginShellFile(), args: ["-l", "-c", command] }),
  childrenByParent: () => {
    try {
      return parseChildren(execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }));
    } catch {
      // ps が使えなければ、親子は分からない（止めるときはそのプロセスだけ）
      return new Map();
    }
  },
};
