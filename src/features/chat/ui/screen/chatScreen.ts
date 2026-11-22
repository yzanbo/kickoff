// 1 つのチャットの画面の値（チャット・種類・置き場所・画面の要素）。ChatEnvironment が配る（部品を import しない葉）
import { createContext, type RefObject } from "react";
import type { ChatHost, ChatRole } from "./chatHost";

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
