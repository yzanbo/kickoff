// ワークツリーの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { Conflict, NotFound } from "@/foundation/core/errors";
import { forgetWorktrees } from "@/foundation/core/workplace/worktrees";
import type { AiApi } from "@/features/ai/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { DockerApi } from "@/features/docker/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import type { ChatRunPort, TurnContributor, ChatStoreDeps } from "@/features/chat/core/index";
import type { WorkplaceMoveApi } from "@/features/workplaceMove/core/index";
import { AiWorktreeFinish } from "./aiFinish";
import { baseOf } from "./create";
import { createWorktreeStores, type WorktreeStores } from "./db/stores";
import { WorktreeEnvService } from "./env/service";
import { createWorktreeEvents, type WorktreeEvents } from "./events";
import { HeadWatch, unwatchedProject } from "./headWatch";
import type { MergeCheck } from "./inspect";
import { WorktreeRemover } from "./remove";
import { worktreeRoutes } from "./routes/worktrees";
import { WorktreeService } from "./service";
import { worktreeToolGroup, worktreeTurnParts } from "./tools";
import { registerWorktreeTrash } from "./trash";

export type { WorktreeEnvService } from "./env/service";
export type { AiWorktreeFinish } from "./aiFinish";
export type { MergeCheck } from "./inspect";
export { createWorktreeStores, type WorktreeStores } from "./db/stores";

export interface WorktreesDeps {
  trash: TrashApi;
  /** 受け口の :projectId の引き当て */
  projects: Pick<ProjectsApi, "param">;
  /** ブランチの名前の案を AI に聞く */
  ai: AiApi;
  /** compose の口と待っているソケット（実行環境・後始末） */
  docker: Pick<DockerApi, "compose" | "portProbe">;
  /** 作業中か・送信待ち・作業場所を移す・実行に足すもの（PORT）を登録する */
  chat: { runner: ChatRunPort; store: Pick<ChatStoreDeps, "chats" | "events" | "projects" | "trash">; addTurnContributor(c: TurnContributor): void };
  /** 片付けたワークツリーのチャットを本体へ移す */
  workplaceMove: Pick<WorkplaceMoveApi, "move">;
}

export interface WorktreesApi extends Pick<WorktreeEvents, "onRemoved" | "onChanged"> {
  /** ワークツリーを作る（新しく作ったときだけ実行環境を整える。PR の取り出しが使う） */
  create: WorktreeService["create"];
  /** 実行環境（ポートの帯・Docker の組の名前。チャットの AI とターミナルには PORT を渡す） */
  envs: WorktreeEnvService;
  /** AI の finish_worktree（確かめ・予約。消すのは画面の「消す」と同じ手順） */
  aiFinish: AiWorktreeFinish;
  /** 表の店（実行環境と色。ポートの帯の持ち主を ports が読む） */
  stores: WorktreeStores;
  /** 取り込み済みかの Git の外の見分けを足す（github がマージ済みの PR を登録する） */
  mergeChecks: { register(check: MergeCheck): () => void };
  /** ワークツリーの DB から作った接続を引く口（database が登録する。消す確認の「この接続も消す」） */
  useDbConnections(fn: (folder: string) => { id: number; name: string }[]): void;
}

/** ワークツリー（作る・一覧・実行環境・後始末と、ブランチの切り替え・ワークツリーの足し引きの見張り） */
export function createWorktrees(k: Kernel, deps: WorktreesDeps): CoreFeature<WorktreesApi> {
  // ワークツリーの実行環境（ワークツリーを作ったときにポートの帯と組の名前を割り当てる）
  const stores = createWorktreeStores(k.db);
  const { projects, chats, events, trash } = deps.chat.store;
  const envs = new WorktreeEnvService(stores, deps.docker);
  // ブランチを替えた・ワークツリーを足した消したら、一覧の覚えを捨ててから知らせる（画面が取り直す）
  const headWatch = new HeadWatch((project_id) => {
    const project = projects.get(project_id);
    if (project) forgetWorktrees(project.repo_path);
    k.bus.publish({ type: "worktrees_changed", project_id });
  });
  // 消した・アーカイブしたプロジェクトは見張りを外す
  const stopUnwatch = k.bus.subscribe((event) => {
    const id = unwatchedProject(event);
    if (id !== null) headWatch.unwatch(id);
  });
  const service = new WorktreeService({ store: { ...stores, chats }, envs, headWatch, runner: deps.chat.runner, providers: deps.ai.providers });
  const create = service.create.bind(service);
  // 消す（消す前の確かめ・控え（ゴミ箱に 3 日）・チャットを本体へ・実行環境を空ける）と、AI の後始末（ワークツリー自身のチャットからは予約）
  const worktreeEvents = createWorktreeEvents();
  const mergeChecks: MergeCheck[] = [];
  const remover = new WorktreeRemover({ store: { ...stores, projects, chats, trash }, runner: deps.chat.runner, moveWorkplace: deps.workplaceMove.move, envs, compose: deps.docker.compose, trashBin: deps.trash, workplace: k.workplace, mergeChecks, events: worktreeEvents });
  const aiFinish = new AiWorktreeFinish({ store: { projects, chats, events }, runner: deps.chat.runner, remover });
  // ゴミ箱から戻す: 同じ名前でワークツリーを作り直し、ブランチと途中の変更を戻す。3 日たったら控えの参照を消す
  registerWorktreeTrash(deps.trash, { projects, create, events: worktreeEvents });
  // ワークツリーを作る人（新しいチャット・AI の create_chat・作業場所の移動が、作業場所の土台から呼ぶ。作ったら実行環境を整える）
  k.workplace.provideCreator({
    createWorktree: async (target, branch, fromDir) => {
      const project = projects.get(target.projectId);
      if (!project) throw new NotFound("プロジェクトが見つかりません");
      const { worktree } = await create(project, branch, { base: await baseOf(fromDir) });
      if (!worktree) throw new Conflict(`ワークツリー（${branch}）を作れませんでした`);
      return { folder: worktree.path };
    },
  });
  // 作業場所がポートの帯を持つワークツリーなら、AI に PORT を渡す
  deps.chat.addTurnContributor(worktreeTurnParts(envs));
  let connectionsIn: (folder: string) => { id: number; name: string }[] = () => [];
  return {
    name: "worktrees",
    api: {
      create,
      envs,
      aiFinish,
      stores,
      onRemoved: worktreeEvents.onRemoved,
      onChanged: worktreeEvents.onChanged,
      mergeChecks: {
        register: (check) => {
          mergeChecks.push(check);
          return () => void mergeChecks.splice(mergeChecks.indexOf(check), 1);
        },
      },
      useDbConnections: (fn) => void (connectionsIn = fn),
    },
    aiTools: [worktreeToolGroup(aiFinish)],
    routes: [worktreeRoutes({ projectParam: deps.projects.param, service, remover, connectionsIn: (folder) => connectionsIn(folder) })],
    stop: () => {
      stopUnwatch();
      headWatch.close();
    },
  };
}
