// ターミナルの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { WorkplaceMoveApi } from "@/features/workplaceMove/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import { isInside } from "@/foundation/core/system/paths";
import { TerminalSessions, type SpawnTerminal } from "./sessions";
import type { TerminalShell } from "./shell";
import { terminalToolGroup } from "./tools";
import { terminalRoutes, type TerminalDevices } from "./routes/terminals";

/** ほかに出す口（コアのプロセスが、閉じた画面のシェルを止める） */
export type TerminalApi = Pick<TerminalSessions, "closeOwnedBy">;

export interface TerminalEnv {
  /** ログインのシェル（macOS は $SHELL -l） */
  shell: TerminalShell;
  /** シェルに足す環境変数（どちらの Kickoff のターミナルか = KICKOFF_TERMINAL_OF） */
  env?: Record<string, string>;
  /** シェルを起こす（テストは偽物。省けば node-pty） */
  spawn?: SpawnTerminal;
}

/** 内蔵ターミナルのシェル（この Mac の画面は IPC、スマホは WebSocket でつなぐ。ワークツリーのシェルには PORT を渡す。AI は出力を読むだけ） */
export function createTerminal(
  k: Kernel,
  deps: { worktrees: WorktreesApi; projects: Pick<ProjectsApi, "param">; chat: Pick<ChatApi, "store">; devices: TerminalDevices; workplaceMove: Pick<WorkplaceMoveApi, "provideRunningTerminals"> },
  env: TerminalEnv,
): CoreFeature<TerminalApi> {
  const terminals = new TerminalSessions({ shell: env.shell, env: env.env, envOf: (cwd) => deps.worktrees.envs.envFor(cwd), spawn: env.spawn });
  // 作業場所を移す前に、元の作業場所（とその中）で動いているシェルを見せる（そのプロジェクトか、プロジェクトのないもの）
  deps.workplaceMove.provideRunningTerminals({
    in: (dir, projectId) =>
      terminals
        .list()
        .filter((t) => (t.project_id === null || t.project_id === projectId) && (t.cwd === dir || isInside(dir, t.cwd)))
        .map((t) => ({ title: t.title, command: t.command })),
  });
  return {
    name: "terminal",
    api: terminals,
    routes: [terminalRoutes({ projectParam: deps.projects.param, store: { settings: deps.chat.store.settings, devices: deps.devices }, terminals, bus: k.bus })],
    aiTools: [terminalToolGroup({ store: deps.chat.store, terminals })],
    stop: () => terminals.closeAll(),
  };
}
