// 利用者が見ているものの受け口（取り決め @shared/userView/contract.ts）
import { userViewContract } from "@shared/userView/contract";
import { implement } from "@/foundation/core/http/implement";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import { userViewBodySchema } from "@/features/userView/core/schemas";

/**
 * 利用者が見ているもの（AI の get_user_view）: この Mac の画面のウィンドウが、見ているものが変わったとき
 * （少しまとめて）と、見ている間 USER_VIEW_REPORT_MS ごとに知らせる。コアは覚えておくだけ（保存しない）。端末には開かない（スマホは入れない）
 */
export function userViewRoutes({ userViews }: { userViews: UserViewRegistry }) {
  return implement(userViewContract, {
    context: {},
    "PUT /api/user-view": {
      body: userViewBodySchema,
      run: ({ body }) => userViews.report(body),
    },
  });
}
