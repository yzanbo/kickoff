import os from "node:os";
import { z } from "zod";
import { archiveCleanupContract, orphanSessionsContract } from "@shared/trash/contract";
import type { OrphanSessionsTrashBody } from "@shared/trash/types";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { realPathLoose } from "@/foundation/core/system/paths";
import { archiveCleanupPreview, runArchiveCleanup } from "@/features/chat/core/sessions/archiveCleanup";
import { listOrphanSessions, trashOrphanSessions, type OrphanSessionDeps } from "@/features/chat/core/sessions/orphanSessions";

// 整理の日数（1 日から 10 年まで。画面の選択肢は ARCHIVE_CLEANUP_DAYS）
const days = z.number().int().min(1).max(3650);
const orphanTrashSchema = z.object({ session_ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<OrphanSessionsTrashBody>;

/** どのチャットも使っていない会話記録の片付け（設定の「ゴミ箱と整理」）: 一覧と、選んだものをゴミ箱へ */
export function orphanSessionRoutes({ store, trashBin, providers, sessionsElsewhere }: Pick<ChatRouteDeps, "store" | "trashBin" | "providers" | "sessionsElsewhere">) {
  const orphanDeps: OrphanSessionDeps = {
    store,
    providers,
    trashBin,
    sessionsElsewhere: sessionsElsewhere ?? (() => new Set()),
    projectOfPath: (cwd) => trashBin.projectOf(cwd),
    // Kickoff の 1 回だけの問い合わせ（名前付け・要約など）は OS の一時フォルダで動かす（providers/claude/provider.ts の askOnce）
    askDir: realPathLoose(os.tmpdir()),
  };
  return implement(orphanSessionsContract, {
    context: {},
    "GET /api/orphan-sessions": { run: () => listOrphanSessions(orphanDeps) },
    "POST /api/orphan-sessions/trash": { body: orphanTrashSchema, run: async ({ body }) => ({ trashed: await trashOrphanSessions(orphanDeps, body.session_ids) }) },
  });
}

/** アーカイブ済みのチャットの整理（取り決めは @shared/trash/contract.ts の archiveCleanupContract）: days 日より前から動いていないものの見込みと、まとめてゴミ箱へ入れる */
export function archiveCleanupRoutes({ store, trashBin, runner, providers, providerHandoff }: Pick<ChatRouteDeps, "store" | "trashBin" | "runner" | "providers" | "providerHandoff">) {
  return implement(archiveCleanupContract, {
    context: {},
    "GET /api/archive-cleanup": { query: z.object({ days: z.coerce.number().pipe(days) }), run: ({ query }) => archiveCleanupPreview({ store, providers, remembered: providerHandoff.sessionsOf }, query.days) },
    "POST /api/archive-cleanup": { body: z.object({ days }), run: ({ body }) => runArchiveCleanup({ store, trashBin, runner }, body.days) },
  });
}
