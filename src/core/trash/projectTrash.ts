// プロジェクトを Kickoff のゴミ箱に入れる・戻す・本当に消す（メモの仕様書「ファイル削除」の Q20）。
// ゴミ箱にある間はプロジェクトの行（チャット・DB の接続・定型文・設定など、プロジェクトに付くもの）を丸ごと残し、ふだんの読み取りから外すだけ。
// 中のチャットはプロジェクトの行と一緒に入れ（chats.trashed_with）、戻すと一緒に戻る。3 日たったら、チャットの分を片付けてからプロジェクトの行を消す
import type { Project } from "@shared/types";
import type { Store } from "../db/store.js";
import type { StoredTrashItem } from "../db/trash.js";
import { purgeChatsOf, restoreChatsOf, type ChatPurgeDeps, type ChatTrashDeps } from "./chatTrash.js";
import type { TrashService } from "./service.js";

/** プロジェクトをゴミ箱へ入れる（作業中のチャットがないことは呼ぶ側が確かめる）。入れたゴミ箱の行を返す */
export function trashProject(deps: ChatTrashDeps, project: Project, at = new Date().toISOString()): StoredTrashItem {
  const item = deps.trashBin.addRecord({ project_id: project.id, kind: "project", label: project.name });
  const chats = deps.store.chats.list({ projectId: project.id, includeArchived: true });
  const ids = chats.flatMap((chat) => [chat.id, ...deps.store.chats.descendants(chat.id).map((c) => c.id)]);
  deps.store.chats.trash([...new Set(ids)], item.id, at);
  for (const id of ids) deps.runner.forget(id);
  deps.store.projects.setTrashed(project.id, at);
  return item;
}

/** 同じフォルダのプロジェクトがゴミ箱にあれば、そのプロジェクト（もう一度登録しようとしたときに、戻すよう知らせる） */
export function trashedProjectAt(store: Store, matches: (project: Project) => boolean): Project | undefined {
  return store.projects.trashed().find(matches);
}

/** ゴミ箱にプロジェクトの扱いを登録する */
export function registerProjectTrash(trashBin: TrashService, deps: ChatPurgeDeps): void {
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
