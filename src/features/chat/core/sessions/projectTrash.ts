// プロジェクトのゴミ箱の行を戻す・本当に消す（中のチャットを一緒に戻す・片付けるので chat が登録する。入れるのは projects の trashProject）。
// 3 日たったら、チャットの分を片付けてからプロジェクトの行を消す
import type { TrashApi } from "@/features/trash/core/index";
import { purgeChatsOf, restoreChatsOf, type ChatPurgeDeps } from "./chatTrash";

/** ゴミ箱にプロジェクトの扱いを登録する */
export function registerProjectTrash(trashBin: TrashApi, deps: ChatPurgeDeps): void {
  trashBin.register("project", {
    restore: (item) => {
      if (item.project_id === null) return;
      deps.store.projects.setTrashed(item.project_id, null);
      restoreChatsOf(deps.store, item.id);
    },
    purge: async (item) => {
      if (item.project_id === null) return;
      // そのプロジェクトのほかのゴミ箱の行（先に消したファイル・チャット）を先に片付ける（置き場のフォルダ・会話記録のファイルを残さない）
      for (const other of deps.store.trash.list(item.project_id)) {
        if (other.id !== item.id) await trashBin.purge(other);
      }
      await purgeChatsOf(deps, item.id);
      deps.store.projects.delete(item.project_id);
    },
  });
}
