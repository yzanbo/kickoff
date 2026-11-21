// 子チャットの取り決め。受け口は src/features/childChats/core/routes.ts
import { route, type Contract } from "@shared/foundation/contract";
import type { ChatDetachBody, ChildChatBody, HandoffBody, HandoffResult, SubagentChildBody } from "@shared/foundation/apiTypes";
import type { Chat } from "@shared/chat/types";

export const childChatContract = {
  /** 作業の終わりの時点から分岐する（作業中は 409・分岐できない時点は 400）。分岐したチャット */
  "POST /api/chats/:chatId/fork": route<{ event_id: number }, Chat>({ status: 201 }),
  /** 子チャットで聞く（親が作業中でも始められる） */
  "POST /api/chats/:chatId/children": route<ChildChatBody, Chat>({ status: 201, access: "device" }),
  /** 子チャットの作業の最後の返答を親チャットに渡す */
  "POST /api/chats/:chatId/handoff": route<HandoffBody, HandoffResult>({ access: "device" }),
  /** サブエージェントに子チャットで聞く（会話の記録を添付にする） */
  "POST /api/chats/:chatId/subagents/:agentId/children": route<SubagentChildBody, Chat>({ status: 201, access: "device" }),
  /** 子チャットを親から外す（親なし・先祖の子に。作業中は 409）。外したあとのチャット */
  "POST /api/chats/:chatId/detach": route<ChatDetachBody, Chat>(),
} as const satisfies Contract;
