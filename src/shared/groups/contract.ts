// グループの取り決め（プロジェクトごとの一覧・作る・並べ替える・名前を変える・消す）。受け口は src/features/groups/core/routes.ts
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { ChatGroup } from "./types";

export const groupContract = {
  /** そのプロジェクトのグループ（並び順） */
  "GET /api/projects/:projectId/groups": route<never, ChatGroup[]>({ access: "device" }),
  /** 作る（いちばん後ろ） */
  "POST /api/projects/:projectId/groups": route<{ name: string }, ChatGroup>({ status: 201 }),
  /** ids の順に並べ直す（並べたあとのそのプロジェクトのグループ） */
  "PUT /api/projects/:projectId/groups/order": route<{ ids: number[] }, ChatGroup[]>(),
  /** 名前を変える（変えたあとのグループ） */
  "PATCH /api/groups/:groupId": route<{ name: string }, ChatGroup>(),
  /** グループだけを消す（中のチャットはグループなしに戻り、そのあと group_deleted を知らせる） */
  "DELETE /api/groups/:groupId": empty(),
} as const satisfies Contract;
