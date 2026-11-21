// 圧縮の受け口（取り決めは @shared/compact/contract.ts）: 手で圧縮する・消去する・圧縮が終わるまで預かった指示を外す・書き直す（段取りは chat の殻）
import { z } from "zod";
import type { Chat } from "@shared/chat/types";
import { compactContract } from "@shared/compact/contract";
import { implement, type Param } from "@/foundation/core/http/implement";
import { attachmentsSchema, editingIdsSchema, messageText } from "@/foundation/core/http/schemas";
import type { ChatRunner } from "@/features/chat/core/index";

type CompactRunner = Pick<ChatRunner, "removeAfterCompact" | "editing" | "updateAfterCompact" | "compact" | "clear">;

export function compactRoutes({ runner, chatParam }: { runner: CompactRunner; chatParam: Param<Chat> }) {
  return implement(compactContract, {
    context: { chatId: chatParam, messageId: { parse: (raw: string) => raw } },
    "DELETE /api/chats/:chatId/after-compact/:messageId": { run: ({ chatId: chat, messageId }) => runner.removeAfterCompact(chat.id, messageId) },
    // 書き直している間は、送る順が来てもその指示から後ろを送らない（途絶えたら外れて送る。変わった様子は SSE の chat_live で届く）
    "PUT /api/chats/:chatId/after-compact/editing": { body: editingIdsSchema, run: ({ chatId: chat, body }) => void runner.editing(chat.id, "now", body.ids) },
    "PATCH /api/chats/:chatId/after-compact/:messageId": {
      body: z.object({ text: messageText, attachments: attachmentsSchema }),
      run: ({ chatId: chat, messageId, body }) => runner.updateAfterCompact(chat.id, messageId, body.text, body.attachments),
    },
    "POST /api/chats/:chatId/compact": { run: ({ chatId: chat }) => runner.compact(chat.id) },
    "POST /api/chats/:chatId/clear": { run: ({ chatId: chat }) => runner.clear(chat.id) },
  });
}
