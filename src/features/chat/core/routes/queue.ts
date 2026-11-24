// 送信待ちの受け口（取り決めは @shared/chat/contract.ts の chatQueueContract）
import { chatQueueContract } from "@shared/chat/contract";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { queueCommandsSchema, queueEditingSchema, queueSendSchema } from "./sendSchemas";

/**
 * 送信待ち（作業中のチャットに送った次の指示の列）と預かり: 命令の列で変える・すぐ送る・書き直している行を知らせる。
 * 応答はどれも、変えたあとの送信待ち（QueueState。SSE の chat_live の queue と同じ形）。列にない指示は 404、送るものがないなどの状態は 409（step が断る）
 */
export function queueRoutes({ runner, chatParam }: Pick<ChatRouteDeps, "runner" | "chatParam">) {
  return implement(chatQueueContract, {
    context: { chatId: chatParam },
    "POST /api/chats/:chatId/queue": { body: queueCommandsSchema, run: ({ chatId: chat, body }) => runner.queue(chat.id, body.commands) },
    // 自動で送る次の指示なら、書き直しが終わるまで送らない（途絶えたら外れて送る。列にない指示は数えない）
    "PUT /api/chats/:chatId/queue/editing": { body: queueEditingSchema, run: ({ chatId: chat, body }) => runner.editing(chat.id, body.lane, body.ids) },
    "POST /api/chats/:chatId/queue/send": { body: queueSendSchema, run: ({ chatId: chat, body }) => runner.queueSend(chat.id, body) },
  });
}
