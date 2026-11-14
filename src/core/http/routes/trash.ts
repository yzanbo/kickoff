import type { Hono } from "hono";
import { z } from "zod";
import type { TrashItem, TrashRestoreBody } from "@shared/types";
import type { StoredTrashItem } from "../../db/trash.js";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";

const restoreSchema = z.object({ rename: z.boolean().optional() }) satisfies z.ZodType<TrashRestoreBody>;

/** 画面に返す形（種類ごとの覚え書き details は出さない） */
const toApi = ({ details: _details, ...item }: StoredTrashItem): TrashItem => item;

/**
 * Kickoff のゴミ箱（メモの仕様書「ファイル削除」）。一覧はプロジェクトごと（AI が kickoff-trash で入れたばかりのものも取り込んでから返す）、
 * 元に戻すは戻した場所（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら別の名前で戻す）。本当に消す口は置かない（3 日で消える）
 */
export function trashRoutes(app: Hono, { store, trashBin }: ServerDeps) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/trash", withProject, async (c) => c.json((await trashBin.list(c.var.project.id)).map(toApi)));

  // ゴミ箱のプロジェクト（プロジェクトそのものを消したもの。プロジェクトの「ゴミ箱」タブには出せないので別に読む）
  app.get("/api/trash/projects", (c) => c.json(store.trash.ofKind("project").map(toApi)));

  app.post("/api/trash/:itemId/restore", async (c) => {
    const body = restoreSchema.parse(await jsonBody(c));
    return c.json(await trashBin.restore(c.req.param("itemId"), body));
  });
}
