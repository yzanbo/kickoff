import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { badRequest, conflictOnError, HttpError, requireChat } from "./http.js";
import { attachmentSchema, messageInputSchema } from "./schemas.js";
import type { QueueAddResult, QueueMergeResult } from "@shared/types";

/** 選んだ待ちの指示（送信待ちの複数選択） */
const queueIdsSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) });

/**
 * 作業中のチャットに送った次の指示の待ちの列（送信待ち）: ためる・消す・書き換える・並べ替える・まとめて送る・すぐ送る・
 * 止めておく・「ここまで送ったら止めます」の印。応答はどれも、変えたあとの送信待ち（QueueState。SSE の chat_live の queue と同じ形）
 */
export function queueRoutes(app: Hono, { store, runner }: ServerDeps) {
  const notFound = () => new HttpError(404, "待ちの指示が見つかりません");

  // 次の指示を送る。作業中なら待ちの列に入れ、終わったら順に送る（作業中でなければすぐ送る。hold なら作業していなくても列の最後に足す）
  app.post("/api/chats/:id/queue", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const body = await c.req.json();
    const { text, options, attachments } = messageInputSchema.parse(body);
    const { hold } = z.object({ hold: z.boolean().optional() }).parse(body);
    const added = await conflictOnError(() => runner.queueMessage(chat.id, text, options, attachments, { hold }));
    const result: QueueAddResult = { ...runner.queueState(chat.id), ...added };
    return c.json(result);
  });

  // 待ちの指示をすべて消す
  app.delete("/api/chats/:id/queue", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    runner.clearQueued(chat.id);
    return c.json(runner.queueState(chat.id));
  });

  // その指示のすぐあとに「ここまで送ったら止めます」の印を付ける・外す（右クリックの「この指示のあとで止める」。stop: false で外す・id: null ですべて外す。列にない指示なら 404）
  app.put("/api/chats/:id/queue/stop-after", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { id, stop } = z.object({ id: z.string().min(1).max(100).nullable(), stop: z.boolean().default(true) }).parse(await c.req.json());
    if (!runner.setQueueStopAfter(chat.id, id, stop)) throw notFound();
    return c.json(runner.queueState(chat.id));
  });

  // 印の位置をまとめて置き換える（印のドラッグ・×。0 = 1 件目の上、n = n 件目のあと。列の長さに収める）
  app.put("/api/chats/:id/queue/stops", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { stops } = z.object({ stops: z.array(z.number().int().min(0)).max(200) }).parse(await c.req.json());
    runner.setQueueStops(chat.id, stops);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか（戻したとき、作業中でなければ先頭をすぐ送る）
  app.put("/api/chats/:id/queue/paused", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { paused } = z.object({ paused: z.boolean() }).parse(await c.req.json());
    await runner.setQueuePaused(chat.id, paused);
    return c.json(runner.queueState(chat.id));
  });

  // 画面でいま書き直している待ちの指示（書き直す欄を開いているもの。丸ごと置き換え、空なら外す）。自動で送る次の指示なら、書き直しが終わるまで送らない。
  // 開いている間は持ち時間より短い間隔で知らせ直す（途絶えたら外れて送る。列にない指示は数えない）
  app.put("/api/chats/:id/queue/editing", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { ids } = z.object({ ids: z.array(z.string().min(1).max(100)).max(500) }).parse(await c.req.json());
    runner.setQueueEditing(chat.id, ids);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列から消す
  app.delete("/api/chats/:id/queue/:queueId", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    if (!runner.removeQueued(chat.id, c.req.param("queueId"))) throw notFound();
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの指示の文を書き換える
  app.patch("/api/chats/:id/queue/:queueId", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    // attachments: 添付を置き換える（足す・外す。省けば今のまま）
    const { text, attachments } = z
      .object({ text: z.string().max(50_000), attachments: z.array(attachmentSchema).max(20).optional() })
      .parse(await c.req.json());
    if (!(await badRequest(async () => runner.editQueued(chat.id, c.req.param("queueId"), text, attachments)))) throw notFound();
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの列を並べ替える（index は移したあとの位置）
  app.post("/api/chats/:id/queue/:queueId/move", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { index } = z.object({ index: z.number().int().min(0) }).parse(await c.req.json());
    if (!runner.moveQueued(chat.id, c.req.param("queueId"), index)) throw notFound();
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/chats/:id/queue/send-all", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { ids } = queueIdsSchema.partial().parse(await c.req.json().catch(() => ({})));
    if (!(await conflictOnError(() => runner.sendAllQueued(chat.id, ids)))) throw new HttpError(404, "待ちの指示がありません");
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示を、送らずに 1 件にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）
  app.post("/api/chats/:id/queue/merge", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { ids } = queueIdsSchema.parse(await c.req.json());
    const merged = runner.mergeQueued(chat.id, ids);
    if (!merged) throw new HttpError(400, "まとめるには、送信待ちの指示を 2 件以上選んでください");
    const result: QueueMergeResult = { ...runner.queueState(chat.id), id: merged.id };
    return c.json(result);
  });

  // 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めておくのをやめ、「ここまで」の印を外す。作業中なら終わってから）
  app.post("/api/chats/:id/queue/send-in-order", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    if (!(await conflictOnError(() => runner.sendQueuedInOrder(chat.id)))) throw new HttpError(404, "待ちの指示がありません");
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示をまとめて消す
  app.post("/api/chats/:id/queue/remove-many", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { ids } = queueIdsSchema.parse(await c.req.json());
    runner.removeQueuedMany(chat.id, ids);
    return c.json(runner.queueState(chat.id));
  });

  // 選んだ待ちの指示を、並びを保ったまままとめて移す（to: いちばん上・いちばん下 / before: その指示の前（null ならいちばん下）。ドラッグで落とした位置。
  // below_stop: その位置に「ここまで送ったら止めます」の線があれば、線の下に入れるか（省けば下）。線は動かしていない指示の側に残る）
  app.post("/api/chats/:id/queue/move-many", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const body = queueIdsSchema
      .extend({ to: z.enum(["top", "bottom"]).optional(), before: z.string().min(1).max(100).nullable().optional(), below_stop: z.boolean().optional() })
      .refine((b) => (b.to === undefined) !== (b.before === undefined), "to か before のどちらか一方を指定してください")
      .parse(await c.req.json());
    const to = body.to ?? { before: body.before ?? null, belowStop: body.below_stop };
    runner.moveQueuedMany(chat.id, body.ids, to);
    return c.json(runner.queueState(chat.id));
  });

  // 待ちの 1 件をすぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/chats/:id/queue/:queueId/send", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const sent = await conflictOnError(() => runner.sendQueuedNow(chat.id, c.req.param("queueId")));
    if (!sent) throw notFound();
    return c.json(runner.queueState(chat.id));
  });
}
