// ポートを使っているプロセスの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import { PortProcessService } from "./service";
import { PortWatch } from "./watch";
import { portsRoutes } from "./routes/ports";

export type { PortWatch } from "./watch";

export interface PortsEnv {
  /** 自分（メインのプロセス）の pid。自分と祖先は一覧に出さず、止めさせない（省けば process.pid） */
  selfPid?: number;
  /** 実行が終わってから調べるまでの間（テストで縮める） */
  afterTurnMs?: number;
  /** 止めたあとに待つ時間（テストで縮める） */
  stopWaitMs?: number;
}

/** ポートを使っているプロセス（AI が残した開発サーバーに気付いて止める。調べるのは窓を開いた・チャットの実行が終わったときだけ） */
export function createPorts(k: Kernel, deps: { worktrees: WorktreesApi; projects: ProjectsApi; chat: ChatApi }, env: PortsEnv): CoreFeature<PortWatch> {
  const service = new PortProcessService({ store: { projects: deps.projects.store, worktreeEnvs: deps.worktrees.stores.worktreeEnvs }, probe: k.platform, selfPid: env.selfPid, selfBundle: k.platform.appBundleOf(process.execPath), stopWaitMs: env.stopWaitMs });
  const ports = new PortWatch(k.bus, deps.chat.runner, service, env.afterTurnMs);
  return { name: "ports", api: ports, routes: [portsRoutes({ ports })], start: () => ports.start(), stop: () => ports.close() };
}
