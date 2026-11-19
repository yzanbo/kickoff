import type { Hono } from "hono";
import os from "node:os";
import { z } from "zod";
import type { ArchiveCleanupBody, OrphanSessionsTrashBody } from "@shared/types";
import type { ServerDeps } from "@/foundation/core/http/server";
import { jsonBody, queryOf } from "@/foundation/core/http/input";
import { realPathLoose } from "@/foundation/core/system/paths";
import type { TrashApi } from "@/features/trash/core/index";
import { archiveCleanupPreview, runArchiveCleanup } from "@/features/chat/core/sessions/archiveCleanup";
import { listOrphanSessions, trashOrphanSessions, type OrphanSessionDeps } from "@/features/chat/core/sessions/orphanSessions";

// 整理の日数（1 日から 10 年まで。画面の選択肢は ARCHIVE_CLEANUP_DAYS）
const days = z.coerce.number().int().min(1).max(3650);
const cleanupSchema = z.object({ days }) satisfies z.ZodType<ArchiveCleanupBody>;
const orphanTrashSchema = z.object({ session_ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<OrphanSessionsTrashBody>;

/** 会話記録の片付け（設定の「ゴミ箱と整理」）: どのチャットも使っていない会話記録と、アーカイブ済みのチャットの整理 */
export function sessionRoutes(app: Hono, { store, trashBin, runner, providers, sessionsElsewhere }: Pick<ServerDeps, "store" | "runner" | "providers" | "sessionsElsewhere"> & { trashBin: TrashApi }) {
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

  // アーカイブ済みのチャットの整理: days 日より前から動いていないものの見込みと、まとめてゴミ箱へ入れる
  app.get("/api/archive-cleanup", async (c) => c.json(await archiveCleanupPreview({ store, providers }, days.parse(queryOf(c, "days")))));
  app.post("/api/archive-cleanup", async (c) => {
    const body = cleanupSchema.parse(await jsonBody(c));
    return c.json(runArchiveCleanup({ store, trashBin, runner }, body.days));
  });
}
