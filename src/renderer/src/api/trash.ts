import type { ArchiveCleanupPreview, ArchiveCleanupResult, TrashItem, TrashRestoreResult } from "@shared/types";
import { request, withQuery } from "./http";

/** Kickoff のゴミ箱（コアの http/routes/trash.ts） */
export const trashApi = {
  /** プロジェクトのゴミ箱（新しい順） */
  projectTrash: (projectId: number) => request<TrashItem[]>("GET", `/api/projects/${projectId}/trash`),
  /** ゴミ箱のプロジェクト（プロジェクトそのものを消したもの） */
  trashedProjects: () => request<TrashItem[]>("GET", "/api/trash/projects"),
  /** 1 件（もう消えた・戻したあとなら 404） */
  trashItem: (id: string) => request<TrashItem>("GET", `/api/trash/${id}`),
  /** 元に戻す（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら「名前 2」で戻す） */
  restoreTrash: (id: string, rename = false) => request<TrashRestoreResult>("POST", `/api/trash/${id}/restore`, { rename }),
  /** アーカイブ済みのチャットの整理の見込み（days 日より前から動いていないもの） */
  archiveCleanupPreview: (days: number) => request<ArchiveCleanupPreview>("GET", withQuery("/api/archive-cleanup", { days })),
  /** アーカイブ済みのチャットをまとめてゴミ箱へ入れる */
  archiveCleanup: (days: number) => request<ArchiveCleanupResult>("POST", "/api/archive-cleanup", { days }),
};
