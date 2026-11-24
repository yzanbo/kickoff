// 全ノートの画面の状態と操作（欄の並び・右のタブの欄・探す文・選んでいる欄。欄の中は useNoteSection。描くのは AllNotesPage）
import { useState } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { usePanel } from "@/features/panel/ui";
import { useVisibleProjects } from "@/features/projects/ui";
import { storage } from "@/features/notes/ui/storage";
import { notesStore, useNoteList } from "@/features/notes/ui/store";
import { COMMON_NOTES_LABEL, useCommonNotes } from "@/features/notes/ui/commonNotes";
import { ALL_NOTES_PANEL_KEY, focusedNote, openNoteInPanel } from "@/features/notes/ui/notePanel";
import { allNotesSections } from "./allNotesModel";

/** 全ノートの画面の状態と操作（AllNotesPage が描く） */
export function useAllNotesPage() {
  // 右の欄（どのプロジェクトのノートも 1 つの欄に開く。いつも開いておく）
  const panel = usePanel("notes", "all");
  // 一覧の選んでいる行 = ピントのあるペインで表示中のノート
  const shown = focusedNote(panel);
  const shownPathIn = (id: number) => (shown?.projectId === id ? shown.path : "");
  const [query, setQuery] = useState("");
  const [, setListHidden] = useSetting(storage.settings.listHidden);
  const common = useCommonNotes();
  // サイドバーと同じ並び（アーカイブした・見えないプロジェクトは入らない。タグの絞り込みはチャットの一覧のものなので当てない）
  const { active: projects } = useVisibleProjects();
  const sections = allNotesSections(common.state === "ready" ? { projectId: common.projectId, title: COMMON_NOTES_LABEL } : null, projects);
  // 取り直しの印は共通のノートの欄で出す（プロジェクトの欄は開いたものだけが読む）
  const commonList = useNoteList(common.state === "ready" ? common.projectId : 0, common.state === "ready");
  // 選んでいる欄（押した欄。ほかの欄で選んだ行はその欄が外す）
  const [activeSection, setActiveSection] = useState<number | null>(null);

  /** ノートを右のタブの欄に開く（どの欄のノートも同じ欄に。タブは開いたノートのプロジェクトを持つ） */
  const open = (id: number, path: string, newTab: boolean) => openNoteInPanel(id, path, newTab, ALL_NOTES_PANEL_KEY);
  // 欄でノート・フォルダを作ったら、探している文を消して一覧を出す（作った行を見せる）
  const onCreated = () => {
    setQuery("");
    setListHidden(false);
  };
  // すべての欄を取り直す（閉じている欄は、開いたときに読む）
  const refresh = () => {
    for (const s of sections) notesStore.invalidate(s.projectId);
  };
  return { activeSection, common, onCreated, open, panel, query, refresh, refreshing: commonList.loading, sections, setActiveSection, setQuery, shownPathIn };
}
