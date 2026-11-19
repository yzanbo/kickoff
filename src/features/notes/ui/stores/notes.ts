// プロジェクトごとのノートの一覧（フォルダとファイル）。ノートのタブ・「ノートに追加」の追記先で共通に読む。
// 変わったら知らせ（notes）で取り直す（Finder・ほかのアプリでの変更も、コアがフォルダを見張って知らせる）。見張れなかったときのために、ウィンドウに戻ったとき・30 秒たって使ったときにも取り直す
import type { NoteList } from "@shared/types";
import { api } from "@/foundation/ui/api";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";

/** 取り直すまでの間隔（見張りで拾えなかった、Kickoff の外での変更を拾う） */
const MAX_AGE_MS = 30_000;

export const notesStore = createKeyedStore<number, NoteList>({
  load: (projectId) => api.notes(projectId),
  maxAge: MAX_AGE_MS,
  refreshOnFocus: true,
  // ノートを変えた・プロジェクトのノートの場所を変えた・親フォルダ（設定）を変えた
  reloadOn: (e, projectId) => (e.type === "notes" && e.project_id === projectId) || (e.type === "project" && e.project.id === projectId) || e.type === "settings",
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトのノートの一覧（active が false なら読みに行かない） */
export const useNoteList = (projectId: number, active = true) => useKeyedStore(notesStore, projectId, { active });
