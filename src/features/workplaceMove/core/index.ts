// チャットの作業場所を変える機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { ChatApi } from "@/features/chat/core/index";
import type { AiWorkplaceDeps } from "./aiWorkplace";
import { workplaceMoveTurnParts, workplaceToolGroup } from "./tools";

export interface WorkplaceMoveDeps {
  chat: Pick<ChatApi, "store" | "runner" | "addTurnContributor">;
  /** ワークツリーの後始末の予約・内蔵ターミナル（上の機能なので呼ばれたときに引く） */
  worktreeFinisher: () => AiWorkplaceDeps["worktreeFinisher"];
  terminals: () => AiWorkplaceDeps["terminals"];
}

/** 作業場所の移動: AI が作業場所を移す予約のツール（move_workplace・cancel_workplace_move）と、移したあと最初の実行に添える知らせ */
export function createWorkplaceMove(deps: WorkplaceMoveDeps): CoreFeature<null> {
  const { store, runner } = deps.chat;
  deps.chat.addTurnContributor(workplaceMoveTurnParts(store));
  return {
    name: "workplaceMove",
    api: null,
    aiTools: [workplaceToolGroup({ store, reservations: runner.workplaceMoves, isBusy: (chatId) => runner.isBusy(chatId), worktreeFinisher: deps.worktreeFinisher, terminals: deps.terminals })],
  };
}
