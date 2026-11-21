import type { Hono } from "hono";
import { z } from "zod";
import type { UserViewBody } from "@shared/userView/types";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import { jsonBody } from "@/foundation/core/http/input";
import { userViewSchema } from "@/foundation/core/http/schemas";

/** 見ているものの知らせ（ウィンドウごと。閉じるときは view を null） */
const userViewBodySchema = z.object({
  window_id: z.string().min(1).max(100),
  view: userViewSchema.nullable(),
  chat_ids: z.array(z.number().int().positive()).max(200),
  focused: z.boolean(),
}) satisfies z.ZodType<UserViewBody>;

/**
 * 利用者が見ているもの（AI の get_user_view）: この Mac の画面のウィンドウが、見ているものが変わったとき
 * （少しまとめて）と、見ている間 USER_VIEW_REPORT_MS ごとに知らせる。コアは覚えておくだけ（保存しない）。端末には開かない（スマホは入れない）
 */
export function userViewRoutes(app: Hono, { userViews }: { userViews: UserViewRegistry }) {
  app.put("/api/user-view", async (c) => {
    userViews.report(userViewBodySchema.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
}
