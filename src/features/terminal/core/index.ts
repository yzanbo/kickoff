// ターミナルの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { TerminalSessions, type SpawnTerminal } from "./sessions";
import type { TerminalShell } from "./shell";
import { terminalRoutes } from "./routes/terminals";

export type { TerminalSessions } from "./sessions";

export interface TerminalEnv {
  /** ログインのシェル（macOS は $SHELL -l） */
  shell: TerminalShell;
  /** シェルに足す環境変数（どちらの Kickoff のターミナルか = KICKOFF_TERMINAL_OF） */
  env?: Record<string, string>;
  /** シェルを起こす（テストは偽物。省けば node-pty） */
  spawn?: SpawnTerminal;
}

/** 内蔵ターミナルのシェル（この Mac の画面は IPC、スマホは WebSocket でつなぐ。ワークツリーのシェルには PORT を渡す。AI は出力を読むだけ） */
export function createTerminal(k: KernelWithStore, deps: { worktrees: WorktreesApi }, env: TerminalEnv): CoreFeature<TerminalSessions> {
  const terminals = new TerminalSessions({ shell: env.shell, env: env.env, envOf: (cwd) => deps.worktrees.envs.envFor(cwd), spawn: env.spawn });
  return { name: "terminal", api: terminals, routes: [{ legacy: (app) => terminalRoutes(app, { store: k.store, terminals, bus: k.bus }) }], stop: () => terminals.closeAll() };
}
