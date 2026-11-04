import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { HttpError, requireProject, requireChat } from "./http.js";

/**
 * チャットを別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。グループ・作業場所（ワークツリー）は元のプロジェクトのものなので外し、
 * 作業場所は移った先の本体にする。会話（Claude Code のセッション）は作業フォルダが変わっても続けられる。作業中は断る
 */
export function chatMoveRoutes(app: Hono, { store, runner }: ServerDeps) {
  app.post("/api/chats/:id/move", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { project_id } = z.object({ project_id: z.number().int().positive() }).parse(await c.req.json());
    const project = requireProject(store, String(project_id));
    if (project.id === chat.project_id) return c.json(chat);
    if (runner.isBusy(chat.id)) throw new HttpError(409, "作業中のチャットは移動できません。中断してから行ってください");
    return c.json(store.chats.move(chat.id, project.id));
  });
}
