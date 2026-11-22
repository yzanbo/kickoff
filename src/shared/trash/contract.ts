// ゴミ箱の取り決めのうち、上の機能が受けるもの（アーカイブ済みのチャットの整理。設定の「ゴミ箱と整理」が呼び、受け口は chat の src/features/chat/core/routes/sessions.ts）
import { route, type Contract } from "@shared/foundation/contract";
import type { ArchiveCleanupBody, ArchiveCleanupPreview, ArchiveCleanupResult } from "./types";

export const archiveCleanupContract = {
  /** アーカイブ済みのチャットの整理の見込み（days 日より前から動いていないもの） */
  "GET /api/archive-cleanup": route<never, ArchiveCleanupPreview, { days: number }>(),
  /** まとめてゴミ箱へ入れる */
  "POST /api/archive-cleanup": route<ArchiveCleanupBody, ArchiveCleanupResult>(),
} as const satisfies Contract;
