// 子チャットの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { AiCreateChatDeps } from "./aiCreateChat";
import { startChildChat } from "./children";
import { childChatTurnParts, createChatToolGroup } from "./tools";

export interface ChildChatsDeps {
  chat: Pick<ChatApi, "store" | "runner" | "addTurnContributor">;
  ai: Pick<AiApi, "providers">;
  /** ワークツリーの実行環境（worktrees。上の機能なので呼ばれたときに引く） */
  worktreeEnvs: () => AiCreateChatDeps["worktreeEnvs"];
}

/** 子チャット: AI がチャットを作るツール（create_chat）と、指示に添える家系の文脈 */
export function createChildChats(deps: ChildChatsDeps): CoreFeature<null> {
  const { store, runner } = deps.chat;
  /** 作る側のチャット（parent）の会話を写す元にしてチャットを作って動かし、会話を引き継いだか（写し終えた・いま写している）を返す */
  const startChat: AiCreateChatDeps["startChat"] = async (parent, input) => {
    const chat = await startChildChat({ store, runner, providers: deps.ai.providers }, parent, input);
    // 写すのは作ったあとで待たずに進める。もう写し終えていることもあるので店から引き直す
    const live = runner.live(chat.id);
    return { chat, inherited: (live.phase === "preparing" && live.preparing_for === "inherit") || (store.chats.get(chat.id)?.session_id ?? null) !== null };
  };
  deps.chat.addTurnContributor(childChatTurnParts(store));
  return { name: "childChats", api: null, aiTools: [createChatToolGroup({ store, startChat, worktreeEnvs: deps.worktreeEnvs })] };
}
