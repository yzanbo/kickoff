// プロジェクトごとのメモの一覧（フォルダとファイル）。メモのタブ・「メモに追加」の追記先で共通に読む。
// Kickoff の中で変えたら知らせ（memos）で取り直し、Finder・ほかのアプリで変えたものは、ウィンドウに戻ったとき・30 秒たって使ったときに取り直す
import type { MemoList } from "@shared/types";
import { api } from "@/api";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore } from "./useStore";

/** 取り直すまでの間隔（Kickoff の外での変更を拾う） */
const MAX_AGE_MS = 30_000;

export const memosStore = createKeyedStore<number, MemoList>({
  load: (projectId) => api.memos(projectId),
  maxAge: MAX_AGE_MS,
  refreshOnFocus: true,
  // メモを変えた・プロジェクトのメモの場所を変えた・親フォルダ（設定）を変えた
  reloadOn: (e, projectId) => (e.type === "memos" && e.project_id === projectId) || (e.type === "project" && e.project.id === projectId) || e.type === "settings",
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトのメモの一覧（active が false なら読みに行かない） */
export const useMemoList = (projectId: number, active = true) => useKeyedStore(memosStore, projectId, { active });
