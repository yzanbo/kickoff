import type { Hono } from "hono";
import os from "node:os";
import { z } from "zod";
import type { ArchiveCleanupBody, OrphanSessionsTrashBody, TrashItem, TrashRestoreBody } from "@shared/types";
import type { StoredTrashItem } from "../../db/trash.js";
import type { ServerDeps } from "../server.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { NotFound } from "../errors.js";
import { realPathLoose } from "../../system/paths.js";
import { archiveCleanupPreview, runArchiveCleanup } from "../../trash/archiveCleanup.js";
import { listOrphanSessions, trashOrphanSessions, type OrphanSessionDeps } from "../../trash/orphanSessions.js";

const restoreSchema = z.object({ rename: z.boolean().optional() }) satisfies z.ZodType<TrashRestoreBody>;
// 整理の日数（1 日から 10 年まで。画面の選択肢は ARCHIVE_CLEANUP_DAYS）
const days = z.coerce.number().int().min(1).max(3650);
const cleanupSchema = z.object({ days }) satisfies z.ZodType<ArchiveCleanupBody>;
const orphanTrashSchema = z.object({ session_ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<OrphanSessionsTrashBody>;

/** 画面に返す形（種類ごとの覚え書き details は出さない） */
const toApi = ({ details: _details, ...item }: StoredTrashItem): TrashItem => item;

/**
 * Kickoff のゴミ箱（メモの仕様書「ファイル削除」）。一覧はプロジェクトごと（AI が kickoff-trash で入れたばかりのものも取り込んでから返す）、
 * 元に戻すは戻した場所（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら別の名前で戻す）。本当に消す口は置かない（3 日で消える）
 */
export function trashRoutes(app: Hono, { store, trashBin, runner, providers, sessionsElsewhere }: ServerDeps) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/trash", withProject, async (c) => c.json((await trashBin.list(c.var.project.id)).map(toApi)));

  // ゴミ箱のプロジェクト（プロジェクトそのものを消したもの。プロジェクトの「ゴミ箱」タブには出せないので別に読む）
  app.get("/api/trash/projects", (c) => c.json(store.trash.ofKind("project").map(toApi)));

  // どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など。設定の「ゴミ箱と整理」）
  app.get("/api/trash/unassigned", (c) => c.json(store.trash.unassigned().map(toApi)));

  // どのチャットも使っていない会話記録（メモの仕様書「ファイル削除」の Q17 の「いまある分」）: 一覧と、選んだものをゴミ箱へ
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

  // 1 件（会話の中の kickoff-trash の行の「戻す」が、まだ戻せるかを見る。AI が入れたばかりのものも取り込んでから。なければ 404）
  app.get("/api/trash/:itemId", async (c) => {
    await trashBin.importInbox().catch(() => 0);
    const item = store.trash.get(c.req.param("itemId"));
    if (!item) throw new NotFound("ゴミ箱にありません（もう消えたか、戻したあとです）");
    return c.json(toApi(item));
  });

  // アーカイブ済みのチャットの整理（メモの仕様書「ファイル削除」の Q19）: days 日より前から動いていないものの見込みと、まとめてゴミ箱へ入れる
  app.get("/api/archive-cleanup", async (c) => c.json(await archiveCleanupPreview({ store, providers }, days.parse(queryOf(c, "days")))));
  app.post("/api/archive-cleanup", async (c) => {
    const body = cleanupSchema.parse(await jsonBody(c));
    return c.json(runArchiveCleanup({ store, trashBin, runner }, body.days));
  });

  app.post("/api/trash/:itemId/restore", async (c) => {
    const body = restoreSchema.parse(await jsonBody(c));
    return c.json(await trashBin.restore(c.req.param("itemId"), body));
  });
}
