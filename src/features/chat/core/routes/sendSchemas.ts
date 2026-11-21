// 送る口 1 本と送信待ちの口の本文の確かめ（形は @shared/chat/send）
import { z } from "zod";
import { attachmentsSchema, CONTENT_REQUIRED, editingIdsSchema, hasContent, MAX_QUEUE_SELECTION, messageText, queueId, queueMessageFields } from "@/foundation/core/http/schemas";
import { QUEUE_ACTIONS } from "@shared/chat/types";
import type { QueueCommand } from "@shared/chat/queueCommand";
import type { QueueCommandsBody, QueueEditingBody, QueueSendBody, SendBody } from "@shared/chat/send";

/** 送る口 1 本（POST /api/chats/:id/messages。when を省けば前からの送る口） */
export const sendBodySchema = queueMessageFields.extend({ when: z.enum(["now", "later"]).optional() }).refine(hasContent, CONTENT_REQUIRED) satisfies z.ZodType<SendBody>;

const queueIdList = z.array(queueId).min(1).max(MAX_QUEUE_SELECTION);
const queueCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_action"), action: z.enum(QUEUE_ACTIONS), after: queueId.nullable() }),
  z.object({ op: z.literal("remove"), ids: queueIdList }),
  z.object({ op: z.literal("edit"), id: queueId, text: messageText, attachments: attachmentsSchema.optional() }),
  z.object({ op: z.literal("move"), ids: queueIdList, to: z.union([z.enum(["top", "bottom"]), z.object({ before: queueId.nullable(), below_stop: z.boolean().optional() }), z.object({ index: z.number().int().min(0) })]) }),
  z.object({ op: z.literal("merge"), ids: queueIdList }),
  z.object({ op: z.literal("set_stops"), stops: z.array(z.number().int().min(0)).max(200) }),
  z.object({ op: z.literal("stop_after"), id: queueId.nullable(), stop: z.boolean() }),
  z.object({ op: z.literal("set_paused"), paused: z.boolean() }),
  z.object({ op: z.literal("clear") }),
]) satisfies z.ZodType<QueueCommand>;

/** 送信待ちを変える命令の列（POST /api/chats/:id/queue に commands を書いたとき） */
export const queueCommandsSchema = z.object({ commands: z.array(queueCommandSchema).min(1).max(100) }) satisfies z.ZodType<QueueCommandsBody>;

/** 送信待ちをすぐ送る（POST /api/chats/:id/queue/send） */
export const queueSendSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("now"), ids: z.tuple([queueId]) }),
  z.object({ mode: z.literal("all"), ids: queueIdList.optional() }),
  z.object({ mode: z.literal("in_order") }),
]) satisfies z.ZodType<QueueSendBody>;

/** 画面で書き直している行（PUT /api/chats/:id/queue/editing） */
export const queueEditingSchema = editingIdsSchema.extend({ lane: z.enum(["now", "later"]).default("later") }) satisfies z.ZodType<QueueEditingBody>;
