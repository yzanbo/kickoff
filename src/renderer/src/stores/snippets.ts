// 定型文の一覧（すべての画面で 1 つ。チャット欄の上の帯・一覧・設定で共通）。使い始めたときに 1 回読み、作る・変える・並べ替える・消すはサーバーの知らせで直す。
// プロジェクトを消すと、そのプロジェクトだけの定型文もコアで一緒に消えるので、project_deleted でも外す
import { useMemo } from "react";
import type { BusEvent, Snippet } from "@shared/types";
import { bySnippetPosition, snippetsFor } from "@shared/snippet/snippets";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

/** 読み込み中の空の一覧（描くたびに作らない。書き換えない） */
const NO_SNIPPETS: Snippet[] = Object.freeze([]) as unknown as Snippet[];

/** 知らせで一覧を直す（作った・変えたものは並び順の位置へ。関係なければ同じ一覧） */
export function reduceSnippets(list: Snippet[], event: BusEvent): Snippet[] {
  if (event.type === "snippet") return [...list.filter((s) => s.id !== event.snippet.id), event.snippet].sort(bySnippetPosition);
  if (event.type === "snippet_deleted" && list.some((s) => s.id === event.id)) return list.filter((s) => s.id !== event.id);
  if (event.type === "project_deleted" && list.some((s) => s.project_id === event.id)) return list.filter((s) => s.project_id !== event.id);
  return list;
}

/** 操作の応答（作った・変えた定型文、並べ替えたあとの一覧）は set / update で入れ、知らせを待たずに画面をそろえる */
export const snippetsStore = createStore<Snippet[]>({
  load: () => api.snippets(),
  reduce: reduceSnippets,
});

/** すべての定型文（読み込み中は空） */
export const useAllSnippets = (): Snippet[] => useStore(snippetsStore).data ?? NO_SNIPPETS;

/** そのプロジェクトで使える定型文（共通とそのプロジェクトだけのもの） */
export function useProjectSnippets(projectId: number): Snippet[] {
  const all = useAllSnippets();
  return useMemo(() => snippetsFor(all, projectId), [all, projectId]);
}
