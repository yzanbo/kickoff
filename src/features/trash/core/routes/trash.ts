import type { Hono } from "hono";
import { z } from "zod";
import type { TrashItem, TrashPurgeBody, TrashRestoreBody } from "@shared/trash/types";
import type { Store } from "@/foundation/core/db/store";
import type { StoredTrashItem, TrashStore } from "@/features/trash/core/db/trash";
import type { TrashService } from "@/features/trash/core/service";
import { jsonBody } from "@/foundation/core/http/input";
import { lookups } from "@/foundation/core/http/lookups";
import { NotFound } from "@/foundation/core/errors";

const restoreSchema = z.object({ rename: z.boolean().optional() }) satisfies z.ZodType<TrashRestoreBody>;
// まとめて完全に消す ID（画面に出していたもの。ゴミ箱の ID は uuid）
const purgeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<TrashPurgeBody>;

/** 画面に返す形（種類ごとの覚え書き details は出さない） */
const toApi = ({ details: _details, ...item }: StoredTrashItem): TrashItem => item;

/**
 * Kickoff のゴミ箱。一覧はプロジェクトごと（AI が kickoff-trash で入れたばかりのものも取り込んでから返す）、
 * 元に戻すは戻した場所（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら別の名前で戻す）。3 日で消えるのを待たずに、1 件・まとめて完全に消せる
 */
export function trashRoutes(app: Hono, { store, items, trashBin }: { store: Pick<Store, "projects" | "chats" | "groups">; items: TrashStore; trashBin: TrashService }) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/trash", withProject, async (c) => c.json((await trashBin.list(c.var.project.id)).map(toApi)));

  // ゴミ箱のプロジェクト（プロジェクトそのものを消したもの。プロジェクトの「ゴミ箱」タブには出せないので別に読む）
  app.get("/api/trash/projects", (c) => c.json(items.ofKind("project").map(toApi)));

  // どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など。設定の「ゴミ箱と整理」）
  app.get("/api/trash/unassigned", (c) => c.json(items.unassigned().map(toApi)));

  // 1 件（会話の中の kickoff-trash の行の「戻す」が、まだ戻せるかを見る。AI が入れたばかりのものも取り込んでから。なければ 404）
  app.get("/api/trash/:itemId", async (c) => {
    await trashBin.importInbox().catch(() => 0);
    const item = items.get(c.req.param("itemId"));
    if (!item) throw new NotFound("ゴミ箱にありません（もう消えたか、戻したあとです）");
    return c.json(toApi(item));
  });

  // 3 日を待たずに完全に消す: まとめて（「ゴミ箱を空にする」。画面に出していたものだけ。もうないものは飛ばす）と 1 件（もうなければ 404）
  app.post("/api/trash/purge", async (c) => {
    const body = purgeSchema.parse(await jsonBody(c));
    return c.json({ purged: await trashBin.purgeNow(body.ids) });
  });
  app.delete("/api/trash/:itemId", async (c) => {
    const id = c.req.param("itemId");
    if (!items.get(id)) throw new NotFound("ゴミ箱にありません（もう消えたか、戻したあとです）");
    await trashBin.purgeNow([id]);
    return c.body(null, 204);
  });

  app.post("/api/trash/:itemId/restore", async (c) => {
    const body = restoreSchema.parse(await jsonBody(c));
    return c.json(await trashBin.restore(c.req.param("itemId"), body));
  });
}
