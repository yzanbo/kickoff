// 子チャットの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { WorkplaceKit } from "@/foundation/core/workplace/kit";
import type { AiApi } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { AiCreateChatDeps } from "./aiCreateChat";
import { startChildChat } from "./children";
import { chatDetachPort } from "./detach";
import { childChatRoutes } from "./routes";
import { childChatTurnParts, createChatToolGroup } from "./tools";

export { chatDetachPort } from "./detach";

export interface ChildChatsDeps {
  chat: Pick<ChatApi, "store" | "runner" | "addTurnContributor" | "provideDetach" | "chatParam">;
  ai: Pick<AiApi, "providers">;
  /** 添付の置き場（サブエージェントについて聞くとき、その記録を添付にする） */
  uploads: UploadStore;
  /** ワークツリーを作る人（AI の create_chat の worktree_branch。作業場所の土台 Kernel.workplace） */
  workplace: Pick<WorkplaceKit, "creator">;
}

export interface ChildChatsApi {
  /** 分岐したあとに呼ぶものを足す（上の機能が登録する。remoteImages が外の画像の覚えを写す） */
  onForked(fn: (fromChatId: number, toChatId: number) => Promise<void>): void;
}

/** 子チャット: 子チャットで聞く・分岐・親へ渡す・親から外す（ルートと AI の update_chat の口）、AI がチャットを作るツール（create_chat）、指示に添える家系の文脈 */
export function createChildChats(deps: ChildChatsDeps): CoreFeature<ChildChatsApi> {
  const { store, runner } = deps.chat;
  const providers = deps.ai.providers;
  /** 作る側のチャット（parent）の会話を写す元にしてチャットを作って動かし、会話を引き継いだか（写し終えた・いま写している）を返す */
  const startChat: AiCreateChatDeps["startChat"] = async (parent, input) => {
    const chat = await startChildChat({ store, runner, providers }, parent, input);
    // 写すのは作ったあとで待たずに進める。もう写し終えていることもあるので店から引き直す
    const live = runner.live(chat.id);
    return { chat, inherited: (live.phase === "preparing" && live.preparing_for === "inherit") || (store.chats.get(chat.id)?.session_id ?? null) !== null };
  };
  const forked: ((fromChatId: number, toChatId: number) => Promise<void>)[] = [];
  deps.chat.addTurnContributor(childChatTurnParts(store));
  deps.chat.provideDetach(chatDetachPort(store, (chatId) => runner.isBusy(chatId)));
  return {
    name: "childChats",
    api: { onForked: (fn) => void forked.push(fn) },
    aiTools: [createChatToolGroup({ store, startChat, workplace: deps.workplace })],
    routes: [
      childChatRoutes({
        store,
        runner,
        providers,
        uploads: deps.uploads,
        chatParam: deps.chat.chatParam,
        forked: async (from, to) => {
          for (const fn of forked) await fn(from, to);
        },
      }),
    ],
  };
}
