// ゴミ箱の取り決め（受け口は src/features/trash/core/routes/trash.ts）と、上の機能が受けるもの（アーカイブ済みのチャットの整理・持ち主のない会話記録。
// 設定の「ゴミ箱と整理」が呼び、受け口は chat の src/features/chat/core/routes/sessions.ts）。どれも端末には開かない
import { empty, route, type Contract } from "@shared/foundation/contract";
import type {
  ArchiveCleanupBody,
  ArchiveCleanupPreview,
  ArchiveCleanupResult,
  OrphanSession,
  OrphanSessionsTrashBody,
  TrashItem,
  TrashPurgeBody,
  TrashPurgeResult,
  TrashRestoreBody,
  TrashRestoreResult,
} from "./types";

export const trashContract = {
  /** プロジェクトのゴミ箱（新しい順。AI が kickoff-trash で入れたばかりのものも取り込んでから） */
  "GET /api/projects/:projectId/trash": route<never, TrashItem[]>(),
  /** ゴミ箱のプロジェクト（プロジェクトそのものを消したもの） */
  "GET /api/trash/projects": route<never, TrashItem[]>(),
  /** どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など） */
  "GET /api/trash/unassigned": route<never, TrashItem[]>(),
  /** 1 件（もう消えた・戻したあとなら 404） */
  "GET /api/trash/:itemId": route<never, TrashItem>(),
  /** 3 日を待たずにまとめて完全に消す（画面に出していたものだけ。もうないものは飛ばす） */
  "POST /api/trash/purge": route<TrashPurgeBody, TrashPurgeResult>(),
  /** 3 日を待たずに 1 件を完全に消す（もうなければ 404） */
  "DELETE /api/trash/:itemId": empty(),
  /** 元に戻す（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら「名前 2」で戻す） */
  "POST /api/trash/:itemId/restore": route<TrashRestoreBody, TrashRestoreResult>(),
} as const satisfies Contract;

export const archiveCleanupContract = {
  /** アーカイブ済みのチャットの整理の見込み（days 日より前から動いていないもの） */
  "GET /api/archive-cleanup": route<never, ArchiveCleanupPreview, { days: number }>(),
  /** まとめてゴミ箱へ入れる */
  "POST /api/archive-cleanup": route<ArchiveCleanupBody, ArchiveCleanupResult>(),
} as const satisfies Contract;

export const orphanSessionsContract = {
  /** どのチャットも使っていない会話記録 */
  "GET /api/orphan-sessions": route<never, OrphanSession[]>(),
  /** 選んだ会話記録をゴミ箱へ入れる */
  "POST /api/orphan-sessions/trash": route<OrphanSessionsTrashBody, { trashed: number }>(),
} as const satisfies Contract;
