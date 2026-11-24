import { z } from "zod";
import { trashContract } from "@shared/trash/contract";
import type { TrashItem, TrashPurgeBody, TrashRestoreBody } from "@shared/trash/types";
import type { StoredTrashItem, TrashStore } from "@/features/trash/core/db/trash";
import type { TrashService } from "@/features/trash/core/service";
import { implement, type Param } from "@/foundation/core/http/implement";
import { NotFound } from "@/foundation/core/errors";

const restoreSchema = z.object({ rename: z.boolean().optional() }) satisfies z.ZodType<TrashRestoreBody>;
// まとめて完全に消す ID（画面に出していたもの。ゴミ箱の ID は uuid）
const purgeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }) satisfies z.ZodType<TrashPurgeBody>;
const GONE = "ゴミ箱にありません（もう消えたか、戻したあとです）";

/** 画面に返す形（種類ごとの覚え書き details は出さない） */
const toApi = ({ details: _details, ...item }: StoredTrashItem): TrashItem => item;

/**
 * Kickoff のゴミ箱。一覧はプロジェクトごと（AI が kickoff-trash で入れたばかりのものも取り込んでから返す）、
 * 元に戻すは戻した場所（同じ名前があれば 409 と TRASH_RESTORE_EXISTS。rename なら別の名前で戻す）。3 日で消えるのを待たずに、1 件・まとめて完全に消せる
 */
export function trashRoutes<P extends { id: number }>({ projectParam, items, trashBin }: { projectParam: Param<P>; items: TrashStore; trashBin: TrashService }) {
  return implement(trashContract, {
    context: { projectId: projectParam, itemId: { parse: (raw: string) => raw } },
    "GET /api/projects/:projectId/trash": { run: async ({ projectId: project }) => (await trashBin.list(project.id)).map(toApi) },
    // ゴミ箱のプロジェクト（プロジェクトそのものを消したもの。プロジェクトの「ゴミ箱」タブには出せないので別に読む）
    "GET /api/trash/projects": { run: () => items.ofKind("project").map(toApi) },
    // どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など。設定の「ゴミ箱と整理」）
    "GET /api/trash/unassigned": { run: () => items.unassigned().map(toApi) },
    // 1 件（会話の中の kickoff-trash の行の「戻す」が、まだ戻せるかを見る。AI が入れたばかりのものも取り込んでから）
    "GET /api/trash/:itemId": {
      run: async ({ itemId }) => {
        await trashBin.importInbox().catch(() => 0);
        const item = items.get(itemId);
        if (!item) throw new NotFound(GONE);
        return toApi(item);
      },
    },
    "POST /api/trash/purge": { body: purgeSchema, run: async ({ body }) => ({ purged: await trashBin.purgeNow(body.ids) }) },
    "DELETE /api/trash/:itemId": {
      run: async ({ itemId }) => {
        if (!items.get(itemId)) throw new NotFound(GONE);
        await trashBin.purgeNow([itemId]);
      },
    },
    "POST /api/trash/:itemId/restore": { body: restoreSchema, run: ({ itemId, body }) => trashBin.restore(itemId, body) },
  });
}
