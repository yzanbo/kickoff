import type { Hono } from "hono";
import os from "node:os";
import { z } from "zod";
import { archiveCleanupContract } from "@shared/trash/contract";
import type { OrphanSessionsTrashBody } from "@shared/trash/types";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { jsonBody } from "@/foundation/core/http/input";
import { realPathLoose } from "@/foundation/core/system/paths";
import { archiveCleanupPreview, runArchiveCleanup } from "@/features/chat/core/sessions/archiveCleanup";
import { listOrphanSessions, trashOrphanSessions, type OrphanSessionDeps } from "@/features/chat/core/sessions/orphanSessions";

// 整理の日数（1 日から 10 年まで。画面の選択肢は ARCHIVE_CLEANUP_DAYS）
const days = z.number().int().min(1).max(3650);
const orphanTrashSchema = z.object({ session_ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<OrphanSessionsTrashBody>;

/** どのチャットも使っていない会話記録の片付け（設定の「ゴミ箱と整理」。取り決めに乗せるのは ai の分冊） */
export function orphanSessionRoutes(app: Hono, { store, trashBin, providers, sessionsElsewhere }: Pick<ChatRouteDeps, "store" | "trashBin" | "providers" | "sessionsElsewhere">) {
  // どのチャットも使っていない会話記録: 一覧と、選んだものをゴミ箱へ
  const orphanDeps: OrphanSessionDeps = {
    store,
    providers,
    trashBin,
    sessionsElsewhere: sessionsElsewhere ?? (() => new Set()),
    projectOfPath: (cwd) => trashBin.projectOf(cwd),
    // Kickoff の 1 回だけの問い合わせ（名前付け・要約など）は OS の一時フォルダで動かす（providers/claude/provider.ts の askOnce）
    askDir: realPathLoose(os.tmpdir()),
  };
  app.get("/api/orphan-sessions", async (c) => c.json(await listOrphanSessions(orphanDeps)));
  app.post("/api/orphan-sessions/trash", async (c) => {
    const body = orphanTrashSchema.parse(await jsonBody(c));
    return c.json({ trashed: await trashOrphanSessions(orphanDeps, body.session_ids) });
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
