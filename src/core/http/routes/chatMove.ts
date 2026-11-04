import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { requireProject, requireChat } from "./http.js";
import { jsonBody } from "./schemas.js";

/**
 * チャットを別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。グループ・作業場所（ワークツリー）は元のプロジェクトのものなので外し、
 * 作業場所は移った先の本体にする。会話（Claude Code のセッション）は作業フォルダが変わっても続けられる。作業中は断る
 */
export function chatMoveRoutes(app: Hono, { store, runner }: ServerDeps) {
  app.post("/api/chats/:id/move", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { project_id } = z.object({ project_id: z.number().int().positive() }).parse(await jsonBody(c));
    const project = requireProject(store, String(project_id));
    if (project.id === chat.project_id) return c.json(chat);
    runner.requireIdle(chat.id, "移動");
    return c.json(store.chats.move(chat.id, project.id));
  });
}
