// チャットの作業場所を変える機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import type { AiWorkplaceDeps } from "./aiWorkplace";
import { reserveMove } from "./reserve";
import type { WorkplaceUserMoveDeps } from "./workplaceUserMove";
import { workplaceMoveTurnParts, workplaceToolGroup } from "./tools";

export interface WorkplaceMoveDeps {
  chat: Pick<ChatApi, "store" | "runner" | "addTurnContributor">;
  /** 内蔵ターミナル・ワークツリーの実行環境（上の機能なので呼ばれたときに引く） */
  terminals: () => AiWorkplaceDeps["terminals"];
  worktreeEnvs: () => WorkplaceUserMoveDeps["worktreeEnvs"];
}

/** 作業場所の移動: AI が作業場所を移す予約のツール（move_workplace・cancel_workplace_move）と、移したあと最初の実行に添える知らせ */
export function createWorkplaceMove(deps: WorkplaceMoveDeps): CoreFeature<null> {
  const { store, runner } = deps.chat;
  deps.chat.addTurnContributor(workplaceMoveTurnParts(store));
  return { name: "workplaceMove", api: null, aiTools: [workplaceToolGroup({ store, reservations: moveReservations(deps), isBusy: (chatId) => runner.isBusy(chatId), terminals: deps.terminals })] };
}

/** AI の移す予約と、片付けの予約の読み取り（作業の終わりの予約は chat の入れ物） */
function moveReservations(deps: Pick<WorkplaceMoveDeps, "terminals" | "worktreeEnvs"> & { chat: Pick<ChatApi, "store" | "runner"> }): AiWorkplaceDeps["reservations"] {
  const { store, runner } = deps.chat;
  return {
    reserve: (chatId, plan) => reserveMove({ store, runner, terminals: deps.terminals(), worktreeEnvs: deps.worktreeEnvs() }, chatId, plan),
    cancel: (chatId) => runner.cancelTurnEnd(chatId, "move_workplace") !== null,
    finishing: (chatId) => runner.hasTurnEnd(chatId, "finish_worktree"),
    reservedFolders: () => runner.reservedFolders(),
  };
}
