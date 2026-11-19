// ワークツリーの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { AiApi } from "@/features/ai/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import { WorktreeEnvService } from "./env/service";
import { WorktreeFinisher, type WorktreeFinisherDeps } from "./finish";
import { HeadWatch } from "./headWatch";
import { worktreeRoutes } from "./routes/worktrees";

export type { WorktreeEnvService } from "./env/service";
export type { WorktreeFinisher } from "./finish";

export interface WorktreesDeps {
  trash: TrashApi;
  /** ブランチの名前の案を AI に聞く */
  ai: AiApi;
  docker: DockerService;
  /** 作業中か・送信待ち・作業場所を移す（chat を createX に分けるまでは仮の機能 legacy の Runner） */
  chat: { runner: WorktreeFinisherDeps["runner"] };
  /** 消すときに選ばれたら、そのワークツリーの DB から作った接続を消す（database を分けるまでは仮の機能 legacy から） */
  databases: WorktreeFinisherDeps["databases"];
}

export type WorktreesEnv = Pick<WorktreeFinisherDeps, "mergedPr" | "retryMs">;

export interface WorktreesApi {
  /** 実行環境（ポートの帯・Docker の組の名前。チャットの AI とターミナルには PORT を渡す） */
  envs: WorktreeEnvService;
  /** 後始末（画面の「消す」と AI の finish_worktree） */
  finisher: WorktreeFinisher;
}

/** ワークツリー（作る・一覧・実行環境・後始末と、ブランチの切り替え・ワークツリーの足し引きの見張り） */
export function createWorktrees(k: KernelWithStore, deps: WorktreesDeps, env: WorktreesEnv): CoreFeature<WorktreesApi> {
  // ワークツリーの実行環境（ワークツリーを作ったときにポートの帯と組の名前を割り当てる）
  const envs = new WorktreeEnvService(k.store, deps.docker);
  // ワークツリーの後始末（消す前の確かめ・控え（ゴミ箱に 3 日）・ワークツリー自身のチャットからの予約）
  const finisher = new WorktreeFinisher({ store: k.store, bus: k.bus, runner: deps.chat.runner, worktreeEnvs: envs, databases: deps.databases, trashBin: deps.trash, ...env });
  const headWatch = new HeadWatch((project_id) => k.bus.publish({ type: "worktrees_changed", project_id }));
  return {
    name: "worktrees",
    api: { envs, finisher },
    routes: [{ legacy: (app) => worktreeRoutes(app, { store: k.store, runner: deps.chat.runner, providers: deps.ai.providers, worktreeEnvs: envs, worktreeFinisher: finisher, headWatch }) }],
    stop: () => {
      finisher.close();
      headWatch.close();
    },
  };
}
