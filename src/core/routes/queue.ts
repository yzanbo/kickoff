import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { badRequest, conflictOnError, HttpError, requireRun } from "./http.js";
import { attachmentSchema, messageInputSchema } from "./schemas.js";

/** 選んだ待ちの指示（送信待ちの複数選択） */
const queueIdsSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) });

/**
 * 作業中のチャットに送った次の指示の待ちの列（送信待ち）: ためる・消す・書き換える・並べ替える・まとめて送る・すぐ送る・
 * 止めておく・「ここまで送ったら止めます」の印
 */
export function queueRoutes(app: Hono, { store, runner }: ServerDeps) {
  // 次の指示を送る。作業中なら待ちの列に入れ、終わったら順に送る（作業中でなければすぐ送る。hold なら作業していなくても列の最後に足す）
  app.post("/api/runs/:id/queue", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const body = await c.req.json();
    const { text, options, attachments } = messageInputSchema.parse(body);
    const { hold } = z.object({ hold: z.boolean().optional() }).parse(body);
    return c.json(await conflictOnError(() => runner.queueMessage(run.id, text, options, attachments, { hold })));
  });

  // 待ちの指示をすべて消す
  app.delete("/api/runs/:id/queue", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json({ removed: runner.clearQueued(run.id), queue: runner.queued(run.id) });
  });

  // その指示のすぐあとに「ここまで送ったら止めます」の印を付ける・外す（右クリックの「この指示のあとで止める」。stop: false で外す・id: null ですべて外す。列にない指示なら 404）
  app.put("/api/runs/:id/queue/stop-after", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { id, stop } = z.object({ id: z.string().min(1).max(100).nullable(), stop: z.boolean().default(true) }).parse(await c.req.json());
    if (!runner.setQueueStopAfter(run.id, id, stop)) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ stops: runner.queueStops(run.id), queue: runner.queued(run.id) });
  });

  // 印の位置をまとめて置き換える（印のドラッグ・×。0 = 1 件目の上、n = n 件目のあと。列の長さに収める）
  app.put("/api/runs/:id/queue/stops", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { stops } = z.object({ stops: z.array(z.number().int().min(0)).max(200) }).parse(await c.req.json());
    runner.setQueueStops(run.id, stops);
    return c.json({ stops: runner.queueStops(run.id), queue: runner.queued(run.id) });
  });

  // 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか（戻したとき、作業中でなければ先頭をすぐ送る）
  app.put("/api/runs/:id/queue/paused", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { paused } = z.object({ paused: z.boolean() }).parse(await c.req.json());
    return c.json({ paused: await runner.setQueuePaused(run.id, paused), queue: runner.queued(run.id) });
  });

  // 待ちの列から消す
  app.delete("/api/runs/:id/queue/:queueId", (c) => {
    const run = requireRun(store, c.req.param("id"));
    if (!runner.removeQueued(run.id, c.req.param("queueId"))) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの指示の文を書き換える
  app.patch("/api/runs/:id/queue/:queueId", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    // attachments: 添付を置き換える（足す・外す。省けば今のまま）
    const { text, attachments } = z
      .object({ text: z.string().max(50_000), attachments: z.array(attachmentSchema).max(20).optional() })
      .parse(await c.req.json());
    if (!(await badRequest(async () => runner.editQueued(run.id, c.req.param("queueId"), text, attachments)))) {
      throw new HttpError(404, "待ちの指示が見つかりません");
    }
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの列を並べ替える（index は移したあとの位置）
  app.post("/api/runs/:id/queue/:queueId/move", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { index } = z.object({ index: z.number().int().min(0) }).parse(await c.req.json());
    if (!runner.moveQueued(run.id, c.req.param("queueId"), index)) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/runs/:id/queue/send-all", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { ids } = queueIdsSchema.partial().parse(await c.req.json().catch(() => ({})));
    if (!(await conflictOnError(() => runner.sendAllQueued(run.id, ids)))) throw new HttpError(404, "待ちの指示がありません");
    return c.json({ ok: true });
  });

  // 選んだ待ちの指示を、送らずに 1 件にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）
  app.post("/api/runs/:id/queue/merge", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { ids } = queueIdsSchema.parse(await c.req.json());
    const merged = runner.mergeQueued(run.id, ids);
    if (!merged) throw new HttpError(400, "まとめるには、送信待ちの指示を 2 件以上選んでください");
    return c.json({ id: merged.id, queue: runner.queued(run.id) });
  });

  // 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めておくのをやめ、「ここまで」の印を外す。作業中なら終わってから）
  app.post("/api/runs/:id/queue/send-in-order", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    if (!(await conflictOnError(() => runner.sendQueuedInOrder(run.id)))) throw new HttpError(404, "待ちの指示がありません");
    return c.json({ ok: true });
  });

  // 選んだ待ちの指示をまとめて消す
  app.post("/api/runs/:id/queue/remove-many", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { ids } = queueIdsSchema.parse(await c.req.json());
    return c.json({ removed: runner.removeQueuedMany(run.id, ids), queue: runner.queued(run.id) });
  });

  // 選んだ待ちの指示を、並びを保ったまままとめて移す（to: いちばん上・いちばん下 / before: その指示の前（null ならいちばん下）。ドラッグで落とした位置。
  // below_stop: その位置に「ここまで送ったら止めます」の線があれば、線の下に入れるか（省けば下）。線は動かしていない指示の側に残る）
  app.post("/api/runs/:id/queue/move-many", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const body = queueIdsSchema
      .extend({ to: z.enum(["top", "bottom"]).optional(), before: z.string().min(1).max(100).nullable().optional(), below_stop: z.boolean().optional() })
      .refine((b) => (b.to === undefined) !== (b.before === undefined), "to か before のどちらか一方を指定してください")
      .parse(await c.req.json());
    const to = body.to ?? { before: body.before ?? null, belowStop: body.below_stop };
    return c.json({ moved: runner.moveQueuedMany(run.id, body.ids, to), queue: runner.queued(run.id) });
  });

  // 待ちの 1 件をすぐ送る（作業中なら止めずに、いまのやり取りに伝える。伝えられなければ列の先頭に戻す）
  app.post("/api/runs/:id/queue/:queueId/send", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const sent = await conflictOnError(() => runner.sendQueuedNow(run.id, c.req.param("queueId")));
    if (!sent) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ ok: true });
  });
}
