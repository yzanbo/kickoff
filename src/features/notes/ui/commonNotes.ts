// 共通のノート（Kickoff が用意する見えないプロジェクトのノート）の画面の口: 欄の名前・使えるか・ノートの持ち主の名前・見えないプロジェクトの代わりに使うプロジェクト。
// 見えないプロジェクトの画面はないので、そのノートから画面を移る所（開く・新しいチャット）はここでいま見ているプロジェクトに置き換える
import type { NoteDefaults } from "@shared/notes/types";
import type { Project } from "@shared/projects/types";
import { isListedProject } from "@shared/projects/kinds";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";
import { parse, routeProjectId } from "@/foundation/ui/navigation/router";
import { currentProjectsIndex, projectInView } from "@/features/projects/ui";
import { notesApi } from "./api";

/** 共通のノートの欄・持ち主の名前（見えないプロジェクトの name は言語によらない作ったときの名前なので、画面ではこちらを出す） */
export const COMMON_NOTES_LABEL = "共通のノート";

/** 共通のノートの欄が空のときの案内（ノートのタブ・全ノートの画面で同じ） */
export const COMMON_NOTES_EMPTY_HINT = "共通のノートはまだありません。見出しの ＋ から作ると、どのプロジェクトのノートのタブ・全ノートの画面からも開けます（どのチャットの AI からも読み書きできます）。";

// 共通のノートの id と使えない理由（コアは知らせを出さないので、設定とプロジェクトの知らせで読み直す。重なり・場所はどちらかが変わったときにだけ変わる）
const defaultsStore = createStore<NoteDefaults>({ load: () => notesApi("GET /api/notes/defaults"), reloadOn: { settings: true, project: true } });

/** 共通のノートの様子（loading: まだ分からない = 欄を出さない。unavailable: 理由の文だけを出す） */
export type CommonNotes = { state: "loading" } | { state: "ready"; projectId: number } | { state: "unavailable"; message: string };

const LOADING: CommonNotes = { state: "loading" };

/** ノートの既定の場所と共通のノートの様子（設定のノートの節。届くまでは undefined） */
export const useNoteDefaults = (): NoteDefaults | undefined => useStore(defaultsStore).data;

/** 共通のノートの様子（id か使えない理由。どちらもない間は読み込み中） */
export function useCommonNotes(): CommonNotes {
  const { data } = useStore(defaultsStore);
  if (data?.common_project_id != null) return { state: "ready", projectId: data.common_project_id };
  if (data?.common_unavailable) return { state: "unavailable", message: data.common_unavailable.message };
  return LOADING;
}

/** ノートの持ち主の名前（見えないプロジェクトなら「共通のノート」。まだ分からなければ空） */
export const noteOwnerName = (project: Project | undefined): string => (project ? (isListedProject(project) ? project.name : COMMON_NOTES_LABEL) : "");

/** 見えないプロジェクトか（部品の外から。プロジェクトの一覧がまだ届いていなければふつうのプロジェクトとみなす） */
export function isHiddenProject(projectId: number): boolean {
  const project = currentProjectsIndex().projectsById.get(projectId);
  return project !== undefined && !isListedProject(project);
}

/**
 * そのノートから画面を移るときのプロジェクト（ふつうはノートのプロジェクト。見えないプロジェクトなら、いま見ているプロジェクト
 * = URL のプロジェクトか、なければサイドバーで最後に選んだもの。プロジェクトが 1 つもなければ undefined）
 */
export function screenProjectFor(projectId: number): number | undefined {
  if (!isHiddenProject(projectId)) return projectId;
  return projectInView(routeProjectId(parse(location.hash)));
}
