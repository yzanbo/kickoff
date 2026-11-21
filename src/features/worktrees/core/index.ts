// ワークツリーの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { forgetWorktrees } from "@/foundation/core/workplace/worktrees";
import type { AiApi } from "@/features/ai/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { ChatRunPort, Store, TurnContributor } from "@/features/chat/core/index";
import { WorktreeEnvService } from "./env/service";
import { WorktreeFinisher, type WorktreeFinisherDeps } from "./finish";
import { HeadWatch } from "./headWatch";
import { worktreeRoutes } from "./routes/worktrees";
import { createWorktreeStores, type WorktreeStores } from "./db/stores";
import { worktreeToolGroup, worktreeTurnParts } from "./tools";

export type { WorktreeEnvService } from "./env/service";
export type { WorktreeFinisher } from "./finish";
export { createWorktreeStores, type WorktreeStores } from "./db/stores";

export interface WorktreesDeps {
  trash: TrashApi;
  /** ブランチの名前の案を AI に聞く */
  ai: AiApi;
  docker: DockerService;
  /** 作業中か・送信待ち・作業場所を移す・実行に足すもの（PORT）を登録する */
  chat: { runner: ChatRunPort; store: Store; addTurnContributor(c: TurnContributor): void };
}

export type WorktreesEnv = Pick<WorktreeFinisherDeps, "mergedPr">;

export interface WorktreesApi {
  /** 実行環境（ポートの帯・Docker の組の名前。チャットの AI とターミナルには PORT を渡す） */
  envs: WorktreeEnvService;
  /** 後始末（画面の「消す」と AI の finish_worktree） */
  finisher: WorktreeFinisher;
  /** 表の店（実行環境と色。ポートの帯の持ち主を ports が読む） */
  stores: WorktreeStores;
  /** ワークツリーの DB から作った接続を引く口（database が登録する。消す確認の「この接続も消す」） */
  useDbConnections(fn: (folder: string) => { id: number; name: string }[]): void;
}

/** ワークツリー（作る・一覧・実行環境・後始末と、ブランチの切り替え・ワークツリーの足し引きの見張り） */
export function createWorktrees(k: Kernel, deps: WorktreesDeps, env: WorktreesEnv): CoreFeature<WorktreesApi> {
  // ワークツリーの実行環境（ワークツリーを作ったときにポートの帯と組の名前を割り当てる）
  const stores = createWorktreeStores(k.db);
  const { projects, chats, events, trash, groups } = deps.chat.store;
  const envs = new WorktreeEnvService(stores, deps.docker);
  // ワークツリーの後始末（消す前の確かめ・控え（ゴミ箱に 3 日）・ワークツリー自身のチャットからの予約）
  const finisher = new WorktreeFinisher({ store: { ...stores, projects, chats, events, trash }, runner: deps.chat.runner, worktreeEnvs: envs, trashBin: deps.trash, workplace: k.workplace, ...env });
  // 作業場所がポートの帯を持つワークツリーなら、AI に PORT を渡す
  deps.chat.addTurnContributor(worktreeTurnParts(envs));
  let connectionsIn: (folder: string) => { id: number; name: string }[] = () => [];
  // ブランチを替えた・ワークツリーを足した消したら、一覧の覚えを捨ててから知らせる（画面が取り直す）
  const headWatch = new HeadWatch((project_id) => {
    const project = projects.get(project_id);
    if (project) forgetWorktrees(project.repo_path);
    k.bus.publish({ type: "worktrees_changed", project_id });
  });
  return {
    name: "worktrees",
    api: { envs, finisher, stores, useDbConnections: (fn) => void (connectionsIn = fn) },
    aiTools: [worktreeToolGroup(finisher)],
    routes: [{ legacy: (app) => worktreeRoutes(app, { store: { ...stores, projects, chats, groups }, connectionsIn: (folder) => connectionsIn(folder), runner: deps.chat.runner, providers: deps.ai.providers, worktreeEnvs: envs, worktreeFinisher: finisher, headWatch }) }],
    stop: () => {
      headWatch.close();
    },
  };
}
