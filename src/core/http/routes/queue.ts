import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { attachmentsSchema, editingIdsSchema, messageText, queueId, queueIdsSchema, queueMessageSchema } from "./schemas.js";
import type { QueueAddResult, QueueMergeResult } from "@shared/types";

/**
 * 作業中のチャットに送った次の指示の待ちの列（送信待ち）: ためる・消す・書き換える・並べ替える・まとめて送る・すぐ送る・
 * 止めておく・「ここまで送ったら止めます」の印。応答はどれも、変えたあとの送信待ち（QueueState。SSE の chat_live の queue と同じ形）。
 * 列にない指示は 404、送るものがないなどの状態は 409（Runner が投げる）
 */
export function queueRoutes(app: Hono, { store, runner }: ServerDeps) {
  const { withChat } = lookups(store);

  // 次の指示を送る。作業中なら待ちの列に入れ、終わったら順に送る（作業中でなければすぐ送る。hold なら作業していなくても列の最後に足す。
  // pause_after なら、列に入れたその指示のすぐあとに一時停止の印を付ける（すぐ送ったら、その作業が終わったら一時停止する））
  app.post("/api/chats/:id/queue", withChat, async (c) => {
    const { chat } = c.var;
    const { text, options, attachments, hold, pause_after } = queueMessageSchema.parse(await jsonBody(c));
    const added = await runner.queueMessage(chat.id, text, options, attachments, { hold, pauseAfter: pause_after });
    const result: QueueAddResult = { ...runner.queueState(chat.id), ...added };
    return c.json(result);
  });

  // 会話を圧縮する行を足す（after: その指示のすぐあと。なければいちばん下。作業していなくても、すぐには圧縮しない）
  app.post("/api/chats/:id/queue/compact", withChat, async (c) => {
    const chat = c.var.chat;
    const { after } = z.object({ after: queueId.nullable().default(null) }).parse(await jsonBody(c));
    runner.queueCompact(chat.id, after);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの指示をすべて消す
  app.delete("/api/chats/:id/queue", withChat, (c) => {
    const { chat } = c.var;
    runner.clearQueued(chat.id);
    return c.json(runner.queueState(chat.id));
  });

  // その指示のすぐあとに「ここまで送ったら止めます」の印を付ける・外す（右クリックの「この指示のあとで止める」。stop: false で外す・id: null ですべて外す。列にない指示なら 404）
  app.put("/api/chats/:id/queue/stop-after", withChat, async (c) => {
    const { chat } = c.var;
    const { id, stop } = z.object({ id: queueId.nullable(), stop: z.boolean().default(true) }).parse(await jsonBody(c));
    runner.setQueueStopAfter(chat.id, id, stop);
    return c.json(runner.queueState(chat.id));
  });

  // 印の位置をまとめて置き換える（印のドラッグ・×。0 = 1 件目の上、n = n 件目のあと。列の長さに収める）
  app.put("/api/chats/:id/queue/stops", withChat, async (c) => {
    const { chat } = c.var;
    const { stops } = z.object({ stops: z.array(z.number().int().min(0)).max(200) }).parse(await jsonBody(c));
    runner.setQueueStops(chat.id, stops);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか（戻したとき、作業中でなければ先頭をすぐ送る）
  app.put("/api/chats/:id/queue/paused", withChat, async (c) => {
    const { chat } = c.var;
    const { paused } = z.object({ paused: z.boolean() }).parse(await jsonBody(c));
    await runner.setQueuePaused(chat.id, paused);
    return c.json(runner.queueState(chat.id));
  });

  // 画面でいま書き直している待ちの指示（書き直す欄を開いているもの。丸ごと置き換え、空なら外す）。自動で送る次の指示なら、書き直しが終わるまで送らない。
  // 開いている間は持ち時間より短い間隔で知らせ直す（途絶えたら外れて送る。列にない指示は数えない）
  app.put("/api/chats/:id/queue/editing", withChat, async (c) => {
    const { chat } = c.var;
    const { ids } = editingIdsSchema.parse(await jsonBody(c));
    runner.setQueueEditing(chat.id, ids);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列から消す
  app.delete("/api/chats/:id/queue/:queueId", withChat, (c) => {
    const { chat } = c.var;
    runner.removeQueued(chat.id, c.req.param("queueId"));
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの指示の文を書き換える
  app.patch("/api/chats/:id/queue/:queueId", withChat, async (c) => {
    const { chat } = c.var;
    // attachments: 添付を置き換える（足す・外す。省けば今のまま）
    const { text, attachments } = z.object({ text: messageText, attachments: attachmentsSchema.optional() }).parse(await jsonBody(c));
    runner.editQueued(chat.id, c.req.param("queueId"), text, attachments);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列を並べ替える（index は移したあとの位置）
  app.post("/api/chats/:id/queue/:queueId/move", withChat, async (c) => {
    const { chat } = c.var;
    const { index } = z.object({ index: z.number().int().min(0) }).parse(await jsonBody(c));
    runner.moveQueued(chat.id, c.req.param("queueId"), index);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/chats/:id/queue/send-all", withChat, async (c) => {
    const { chat } = c.var;
    const { ids } = queueIdsSchema.partial().parse(await jsonBody(c));
    await runner.sendAllQueued(chat.id, ids);
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示を、送らずに 1 件にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）
  app.post("/api/chats/:id/queue/merge", withChat, async (c) => {
    const { chat } = c.var;
    const { ids } = queueIdsSchema.parse(await jsonBody(c));
    const merged = runner.mergeQueued(chat.id, ids);
    const result: QueueMergeResult = { ...runner.queueState(chat.id), id: merged.id };
    return c.json(result);
  });

  // 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めておくのをやめ、「ここまで」の印を外す。作業中なら終わってから）
  app.post("/api/chats/:id/queue/send-in-order", withChat, async (c) => {
    const { chat } = c.var;
    await runner.sendQueuedInOrder(chat.id);
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示をまとめて消す
  app.post("/api/chats/:id/queue/remove-many", withChat, async (c) => {
    const { chat } = c.var;
    const { ids } = queueIdsSchema.parse(await jsonBody(c));
    runner.removeQueuedMany(chat.id, ids);
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示を、並びを保ったまままとめて移す（to: いちばん上・いちばん下 / before: その指示の前（null ならいちばん下）。ドラッグで落とした位置。
  // below_stop: その位置に「ここまで送ったら止めます」の線があれば、線の下に入れるか（省けば下）。線は動かしていない指示の側に残る）
  app.post("/api/chats/:id/queue/move-many", withChat, async (c) => {
    const { chat } = c.var;
    const body = queueIdsSchema
      .extend({ to: z.enum(["top", "bottom"]).optional(), before: queueId.nullable().optional(), below_stop: z.boolean().optional() })
      .refine((b) => (b.to === undefined) !== (b.before === undefined), "to か before のどちらか一方を指定してください")
      .parse(await jsonBody(c));
    const to = body.to ?? { before: body.before ?? null, belowStop: body.below_stop };
    runner.moveQueuedMany(chat.id, body.ids, to);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの 1 件をすぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/chats/:id/queue/:queueId/send", withChat, async (c) => {
    const { chat } = c.var;
    await runner.sendQueuedNow(chat.id, c.req.param("queueId"));
    return c.json(runner.queueState(chat.id));
  });
}
