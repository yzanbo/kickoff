// 送信待ちの受け口（取り決めは @shared/chat/contract.ts の chatQueueContract）
import { z } from "zod";
import { chatQueueContract } from "@shared/chat/contract";
import type { QueueCommandsBody, QueueMessageBody } from "@shared/chat/send";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { attachmentsSchema, messageText, queueId, queueIdsSchema, queueMessageSchema } from "@/foundation/core/http/schemas";
import { queueCommandsSchema, queueEditingSchema, queueSendSchema } from "./sendSchemas";
import { marksOf } from "@shared/chat/handoff";

/**
 * POST …/queue の本文は 2 つの形（commands があれば命令の列、なければ送る指示）。選んだ形の zod の失敗をそのまま返す
 * （合併の zod にすると 400 の中身が変わる）。入力の形は 2 つの合併
 */
const queueBodySchema = z.unknown().transform((raw, ctx) => {
  const parsed = raw && typeof raw === "object" && "commands" in raw ? queueCommandsSchema.safeParse(raw) : queueMessageSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
  return z.NEVER;
}) as unknown as z.ZodType<z.output<typeof queueCommandsSchema> | z.output<typeof queueMessageSchema>, QueueMessageBody | QueueCommandsBody>;

/** 挟む行の位置（その指示のすぐあと。なければいちばん下） */
const actionBody = z.object({ after: queueId.nullable().default(null) });

/**
 * 作業中のチャットに送った次の指示の待ちの列（送信待ち）: ためる・消す・書き換える・並べ替える・まとめて送る・すぐ送る・
 * 止めておく・「ここまで送ったら止めます」の印。応答はどれも、変えたあとの送信待ち（QueueState。SSE の chat_live の queue と同じ形）。
 * 列にない指示は 404、送るものがないなどの状態は 409（Runner が投げる）
 */
export function queueRoutes({ runner, userSent, chatParam }: Pick<ChatRouteDeps, "runner" | "userSent" | "chatParam">) {
  const state = (chatId: number) => runner.queueState(chatId);
  return implement(chatQueueContract, {
    context: { chatId: chatParam, queueId: { parse: (raw: string) => raw } },
    "POST /api/chats/:chatId/queue": {
      body: queueBodySchema,
      run: async ({ chatId: chat, body, caller }) => {
        if ("commands" in body) return runner.queue(chat.id, body.commands);
        const added = await runner.queueMessage(chat.id, body.text, body.options, body.attachments, { hold: body.hold, pauseAfter: body.pause_after, marks: marksOf(body) });
        userSent(caller, chat.id, body.user_view);
        return { ...state(chat.id), ...added };
      },
    },
    // 指示の代わりに挟む行を足す（compact: 会話の圧縮 / clear: コンテキストの消去。作業していなくても、すぐには行わない）
    "POST /api/chats/:chatId/queue/compact": { body: actionBody, run: ({ chatId: chat, body }) => (runner.queueAction(chat.id, "compact", body.after), state(chat.id)) },
    "POST /api/chats/:chatId/queue/clear": { body: actionBody, run: ({ chatId: chat, body }) => (runner.queueAction(chat.id, "clear", body.after), state(chat.id)) },
    // 待ちの指示をすべて消す
    "DELETE /api/chats/:chatId/queue": { run: ({ chatId: chat }) => (runner.clearQueued(chat.id), state(chat.id)) },
    // その指示のすぐあとに「ここまで送ったら止めます」の印を付ける・外す（右クリックの「この指示のあとで止める」。列にない指示なら 404）
    "PUT /api/chats/:chatId/queue/stop-after": {
      body: z.object({ id: queueId.nullable(), stop: z.boolean().default(true) }),
      run: async ({ chatId: chat, body }) => (await runner.setQueueStopAfter(chat.id, body.id, body.stop), state(chat.id)),
    },
    // 印の位置をまとめて置き換える（印のドラッグ・×）
    "PUT /api/chats/:chatId/queue/stops": {
      body: z.object({ stops: z.array(z.number().int().min(0)).max(200) }),
      run: async ({ chatId: chat, body }) => (await runner.setQueueStops(chat.id, body.stops), state(chat.id)),
    },
    "PUT /api/chats/:chatId/queue/paused": { body: z.object({ paused: z.boolean() }), run: async ({ chatId: chat, body }) => (await runner.setQueuePaused(chat.id, body.paused), state(chat.id)) },
    // 自動で送る次の指示なら、書き直しが終わるまで送らない（途絶えたら外れて送る。列にない指示は数えない）
    "PUT /api/chats/:chatId/queue/editing": { body: queueEditingSchema, run: ({ chatId: chat, body }) => runner.editing(chat.id, body.lane, body.ids) },
    "POST /api/chats/:chatId/queue/send": { body: queueSendSchema, run: ({ chatId: chat, body }) => runner.queueSend(chat.id, body) },
    "DELETE /api/chats/:chatId/queue/:queueId": { run: ({ chatId: chat, queueId: id }) => (runner.removeQueued(chat.id, id), state(chat.id)) },
    "PATCH /api/chats/:chatId/queue/:queueId": {
      body: z.object({ text: messageText, attachments: attachmentsSchema.optional() }),
      run: ({ chatId: chat, queueId: id, body }) => (runner.editQueued(chat.id, id, body.text, body.attachments), state(chat.id)),
    },
    "POST /api/chats/:chatId/queue/:queueId/move": {
      body: z.object({ index: z.number().int().min(0) }),
      run: async ({ chatId: chat, queueId: id, body }) => (await runner.moveQueued(chat.id, id, body.index), state(chat.id)),
    },
    "POST /api/chats/:chatId/queue/send-all": { body: queueIdsSchema.partial(), run: async ({ chatId: chat, body }) => (await runner.sendAllQueued(chat.id, body.ids), state(chat.id)) },
    "POST /api/chats/:chatId/queue/merge": {
      body: queueIdsSchema,
      run: ({ chatId: chat, body }) => {
        const merged = runner.mergeQueued(chat.id, body.ids);
        return { ...state(chat.id), id: merged.id };
      },
    },
    "POST /api/chats/:chatId/queue/send-in-order": { run: async ({ chatId: chat }) => (await runner.sendQueuedInOrder(chat.id), state(chat.id)) },
    "POST /api/chats/:chatId/queue/remove-many": { body: queueIdsSchema, run: ({ chatId: chat, body }) => (runner.removeQueuedMany(chat.id, body.ids), state(chat.id)) },
    // 線は動かしていない指示の側に残る
    "POST /api/chats/:chatId/queue/move-many": {
      body: queueIdsSchema
        .extend({ to: z.enum(["top", "bottom"]).optional(), before: queueId.nullable().optional(), below_stop: z.boolean().optional() })
        .refine((b) => (b.to === undefined) !== (b.before === undefined), "to か before のどちらか一方を指定してください"),
      run: async ({ chatId: chat, body }) => (await runner.moveQueuedMany(chat.id, body.ids, body.to ?? { before: body.before ?? null, belowStop: body.below_stop }), state(chat.id)),
    },
    "POST /api/chats/:chatId/queue/:queueId/send": { run: async ({ chatId: chat, queueId: id }) => (await runner.sendQueuedNow(chat.id, id), state(chat.id)) },
  });
}
