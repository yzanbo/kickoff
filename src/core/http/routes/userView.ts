import type { Context, Hono } from "hono";
import { z } from "zod";
import type { UserView, UserViewBody } from "@shared/types";
import type { UserViewRegistry } from "../../userView/registry.js";
import { callerOf } from "../caller.js";
import { jsonBody } from "../input.js";
import type { ServerDeps } from "../server.js";
import { userViewSchema } from "./schemas.js";

/** 見ているものの知らせ（ウィンドウごと。閉じるときは view を null） */
const userViewBodySchema = z.object({
  window_id: z.string().min(1).max(100),
  view: userViewSchema.nullable(),
  chat_ids: z.array(z.number().int().positive()).max(200),
  focused: z.boolean(),
}) satisfies z.ZodType<UserViewBody>;

/** 送る指示に添えた、送った時点の画面の様子を覚える（この Mac の画面から送ったときだけ。スマホの様子は入れない） */
export function rememberSentView(c: Context, userViews: UserViewRegistry, chatId: number, view: UserView | undefined) {
  if (view && callerOf(c).kind === "host") userViews.rememberSent(chatId, view);
}

/**
 * 利用者が見ているもの（AI の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）: この Mac の画面のウィンドウが、見ているものが変わったとき
 * （少しまとめて）と、見ている間 USER_VIEW_REPORT_MS ごとに知らせる。コアは覚えておくだけ（保存しない）。端末には開かない（スマホは入れない）
 */
export function userViewRoutes(app: Hono, { userViews }: ServerDeps) {
  app.put("/api/user-view", async (c) => {
    userViews.report(userViewBodySchema.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
}
