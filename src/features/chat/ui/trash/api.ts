// 設定の「ゴミ箱と整理」の chat の欄の呼び手（取り決めは @shared/trash/contract.ts。受け口は core/routes/sessions.ts）
import { archiveCleanupContract, orphanSessionsContract } from "@shared/trash/contract";
import { client } from "@/foundation/ui/api/client";

export const archiveCleanupApi = client(archiveCleanupContract);
export const orphanSessionsApi = client(orphanSessionsContract);
