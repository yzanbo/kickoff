// チャットの作業場所を変える機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { AiWorkplaceDeps } from "./aiWorkplace";
import { createMover } from "./move";
import { reserveMove } from "./reserve";
import { workplaceMoveRoutes } from "./routes";
import type { RunningTerminalsPort } from "./target";
import { workplaceMoveTurnParts, workplaceToolGroup } from "./tools";

export type { RunningTerminalsPort } from "./target";

export interface WorkplaceMoveDeps {
  chat: Pick<ChatApi, "store" | "runner" | "addTurnContributor" | "sessionTrash" | "chatParam">;
  ai: Pick<AiApi, "providers">;
  /** プロジェクトの本体のフォルダを変えたら、中のチャットの作業場所を移す */
  projects: Pick<ProjectsApi, "afterRepoMove">;
}

export interface WorkplaceMoveApi {
  /** チャットの作業場所を移す（作業場所が変わる道はすべてここ。利用者が移すときは作業中なら 409） */
  move: ReturnType<typeof createMover>;
  /** 作業場所で動いている内蔵ターミナルを聞く口を受ける（terminal が createTerminal の中で登録する） */
  provideRunningTerminals(port: RunningTerminalsPort): void;
}

/** 作業場所の移動: 移す口・ルート（別のプロジェクトへ・作業場所・予約の取り消し）・AI が作業場所を移す予約のツール（move_workplace・cancel_workplace_move）と、移したあと最初の実行に添える知らせ */
export function createWorkplaceMove(k: Kernel, deps: WorkplaceMoveDeps): CoreFeature<WorkplaceMoveApi> {
  const { store, runner, sessionTrash } = deps.chat;
  const move = createMover({ store, providers: deps.ai.providers, sessionTrash, runner });
  let running: RunningTerminalsPort | null = null;
  const terminals = () => running;
  const { workplace } = k;
  deps.chat.addTurnContributor(workplaceMoveTurnParts(store));
  // プロジェクトの本体のフォルダを変えたら、作業フォルダが変わるので、作業場所を移すのと同じく会話を新しいセッションに写して区切りを置く（本体のチャットも）
  deps.projects.afterRepoMove(async (project, moves) => {
    const chats = store.chats.list({ projectId: project.id, includeArchived: true });
    for (const chat of chats) {
      const to = chat.worktree_path ? (moves.get(chat.worktree_path) ?? null) : null;
      await move(chat.id, { worktreePath: to, reason: "folder_moved", fromDir: chat.worktree_path ?? project.repo_path });
    }
    // ゴミ箱にあるチャットも付け替える（戻したときに消えた作業場所を指さないように）
    const used = new Set(chats.flatMap((chat) => (chat.worktree_path ? [chat.worktree_path] : [])));
    for (const from of used) store.chats.replaceWorktree(project.id, from, moves.get(from) ?? null);
  });
  // AI の移す予約と、片付けの予約の読み取り（作業の終わりの予約は chat の入れ物）
  const reservations: AiWorkplaceDeps["reservations"] = {
    reserve: (chatId, plan) => reserveMove({ store, runner, terminals, workplace, move }, chatId, plan),
    cancel: (chatId) => runner.cancelTurnEnd(chatId, "move_workplace") !== null,
    finishing: (chatId) => runner.hasTurnEnd(chatId, "finish_worktree"),
    reservedFolders: () => runner.reservedFolders(),
  };
  return {
    name: "workplaceMove",
    api: { move, provideRunningTerminals: (port) => void (running = port) },
    aiTools: [workplaceToolGroup({ store, reservations, isBusy: (chatId) => runner.isBusy(chatId), terminals })],
    routes: [workplaceMoveRoutes({ store, runner, move, terminals, workplace, chatParam: deps.chat.chatParam })],
  };
}
