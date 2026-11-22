// 1 つのチャットの画面の値（チャット・種類・置き場所・画面の要素）。ChatEnvironment が配る（部品を import しない葉）
import { createContext, useContext, type RefObject } from "react";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import type { ChatHost, ChatRole, NewChatSeed } from "./chatHost";

export interface ChatScreenValue {
  readonly chatId: number;
  /** いまのプロジェクト（チャットをほかのプロジェクトへ移すと変わる） */
  readonly projectId: number;
  readonly role: ChatRole;
  readonly host: ChatHost;
  /** チャットの画面の要素（会話の欄が付ける） */
  readonly root: RefObject<HTMLDivElement | null>;
}

export const ChatScreenContext = createContext<ChatScreenValue | null>(null);

/** 1 つのチャットの画面の値（チャットの画面の中だけで使う部品から。外で使うと例外） */
export function useChatScreen(): ChatScreenValue {
  const screen = useContext(ChatScreenContext);
  if (!screen) throw new Error("useChatScreen はチャットの画面（ChatScreen）の中で使う");
  return screen;
}

/** 1 つのチャットの画面の値（チャットの画面の外でも描く部品から。外では null） */
export const useOptionalChatScreen = (): ChatScreenValue | null => useContext(ChatScreenContext);

/** 新しいチャットのタブに文と添付を入れて開く（作成先はこのチャットのいまのプロジェクト・グループ。置き場所が開けなければ undefined） */
export function askInNewChatOf({ chatId, host }: ChatScreenValue): ((seed: NewChatSeed) => void) | undefined {
  const open = host.openNewChat;
  if (!open) return undefined;
  return (seed) => {
    const chat = knownChat(chatId);
    if (chat) open({ projectId: chat.project_id, group: chat.group_id ?? undefined }, seed);
  };
}
