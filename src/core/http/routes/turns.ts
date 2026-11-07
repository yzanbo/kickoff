import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups, requireProject } from "../lookups.js";
import { chatOptionsSchema, childChatSchema, messageInputSchema, messageText, subagentChildSchema } from "./schemas.js";
import { forkChat } from "../../chat/fork.js";
import { startChildChat } from "../../chat/children.js";
import { startSubagentChildChat } from "../../chat/subagentChild.js";
import { rewindFiles, rewindChat } from "../../chat/rewind.js";
import { workdirOf } from "../../chat/workdir.js";
import type { TellResult } from "@shared/types";

/**
 * チャットの実行（Turn）: 続きを送る・止めずに伝える・止める・圧縮する・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し・ファイルを戻す。
 * 作業中にはできない操作は 409（Runner の requireIdle）。様子が変わるだけ（止める・やめる）で返すものがなければ 204（変わった様子は SSE の chat_live で届く）
 */
export function turnRoutes(app: Hono, { store, runner, providers, uploads }: ServerDeps) {
  const { withChat } = lookups(store);
  /** 分岐・巻き戻しで使う（ファイルの記録を、チャットが動いた作業場所で探す） */
  const deps = { store, runner, providers };

  // 続きを送る（pause_after なら、この作業が終わったら送信待ちを一時停止する = 質問として送る）
  app.post("/api/chats/:id/messages", withChat, async (c) => {
    const { text, options, attachments, pause_after } = messageInputSchema.parse(await jsonBody(c));
    // 作業中のチャットには送れない（409）
    return c.json(await runner.send(c.var.chat.id, text, options, attachments, { pauseAfter: pause_after }));
  });

  // 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る。pause_after は続きを送ると同じ）
  app.post("/api/chats/:id/tell", withChat, async (c) => {
    const { text, options, attachments, pause_after } = messageInputSchema.parse(await jsonBody(c));
    const told: TellResult = { result: await runner.tell(c.var.chat.id, text, options, attachments, { pauseAfter: pause_after }) };
    return c.json(told);
  });

  // 圧縮が終わるまで預かった指示を、送らずに外す（圧縮中に誤って送ったとき。もう伝えたなら 404、伝えている途中なら 409）。外した指示を返す
  app.delete("/api/chats/:id/after-compact/:messageId", withChat, (c) => c.json(runner.removeAfterCompact(c.var.chat.id, c.req.param("messageId"))));

  app.post("/api/chats/:id/cancel", withChat, (c) => {
    runner.cancel(c.var.chat.id);
    return c.body(null, 204);
  });

  // 会話を要約して、コンテキストを空ける（手で圧縮する。作業中なら、送信待ちのいちばん上に圧縮の行を入れて予約する。まだ会話がなければ 409）
  app.post("/api/chats/:id/compact", withChat, async (c) => c.json(await runner.compact(c.var.chat.id)));

  // 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる（待っていなければ 409）
  app.delete("/api/chats/:id/reconnect", withChat, (c) => {
    runner.stopReconnect(c.var.chat.id);
    return c.body(null, 204);
  });

  // 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409）
  app.post("/api/chats/:id/background/:taskId/stop", withChat, async (c) => {
    await runner.stopBackgroundTask(c.var.chat.id, c.req.param("taskId"));
    return c.body(null, 204);
  });

  // 作業の終わり（result イベント）の時点から、新しいチャットに分岐する（作業中は 409、分岐できない時点は 400）
  app.post("/api/chats/:id/fork", withChat, async (c) => {
    const { chat } = c.var;
    const { event_id } = z.object({ event_id: z.number().int() }).parse(await jsonBody(c));
    runner.requireIdle(chat.id, "分岐");
    const cwd = workdirOf(chat, requireProject(store, chat.project_id));
    return c.json(await forkChat(deps, chat, event_id, cwd), 201);
  });

  // 子チャットで聞く（親の作業中でも始められる。inherit なら親の最後まで終わった作業の時点から会話を引き継ぐ）
  app.post("/api/chats/:id/children", withChat, async (c) => {
    const body = childChatSchema.parse(await jsonBody(c));
    const child = await startChildChat(deps, c.var.chat, { text: body.text, quote: body.quote, inherit: body.inherit, eventId: body.event_id, options: body.options, attachments: body.attachments });
    return c.json(child, 201);
  });

  // サブエージェントに子チャットで聞く（サブエージェントの会話の記録を添付にして、このチャットの子チャットを作る。201 で子を返す）
  app.post("/api/chats/:id/subagents/:agentId/children", withChat, async (c) => {
    const body = subagentChildSchema.parse(await jsonBody(c));
    const child = await startSubagentChildChat({ ...deps, uploads }, c.var.chat, { agentId: c.req.param("agentId"), text: body.text, attachments: body.attachments, options: body.options });
    return c.json(child, 201);
  });

  // 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restore_files ならファイルも
  // その発言を送る前の状態に戻す。作業中は 409、巻き戻せない発言・プロバイダー・ファイルを戻せないときは 400）
  app.post("/api/chats/:id/rewind", withChat, async (c) => {
    const { chat } = c.var;
    const { event_id, text, options, restore_files } = z
      .object({ event_id: z.number().int(), text: messageText.default(""), options: chatOptionsSchema, restore_files: z.boolean().default(false) })
      .parse(await jsonBody(c));
    const cwd = workdirOf(chat, requireProject(store, chat.project_id));
    return c.json(await rewindChat(deps, chat, { eventId: event_id, text, options, cwd, restoreFiles: restore_files }));
  });

  // ファイルだけを、自分の発言を送る前の状態に戻す（会話はそのまま）。dry_run なら戻さずに、変わるファイルと行の増減だけを返す
  // （作業中は 409、戻せない発言（ファイルの記録がない）・プロバイダーは 400）
  app.post("/api/chats/:id/rewind-files", withChat, async (c) => {
    const { chat } = c.var;
    const { event_id, dry_run } = z.object({ event_id: z.number().int(), dry_run: z.boolean().default(false) }).parse(await jsonBody(c));
    const cwd = workdirOf(chat, requireProject(store, chat.project_id));
    return c.json(await rewindFiles(deps, chat, { eventId: event_id, cwd, dryRun: dry_run }));
  });
}
