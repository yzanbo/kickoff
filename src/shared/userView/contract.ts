// 利用者が見ているものの取り決め（受け口は src/features/userView/core/routes/userView.ts）。この Mac の画面だけ（端末には開かない）
import { empty, type Contract } from "@shared/foundation/contract";
import type { UserViewBody } from "./types";

export const userViewContract = {
  /** このウィンドウで見ているもの（見ているものが変わったときと、見ている間 USER_VIEW_REPORT_MS ごと。閉じるときは view を null） */
  "PUT /api/user-view": empty<UserViewBody>(),
} as const satisfies Contract;
