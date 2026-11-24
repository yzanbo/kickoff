// ノートのタブの状態と操作（欄を並べる一覧・右のタブの欄・URL の頼み・最後に表示したノート。欄の中は useNoteSection。描くのは NoteTab）
import { useEffect, useEffectEvent, useState } from "react";
import { navigate } from "@/foundation/ui/navigation/router";
import { storage } from "@/features/notes/ui/storage";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { notesStore, useNoteList } from "@/features/notes/ui/store";
import { usePanel, type PanelScope } from "@/features/panel/ui";
import { confirmLeaveNotesUnder } from "@/features/notes/ui/noteLeave";
import { focusedNote, notePanelKey, openNoteInPanel } from "@/features/notes/ui/notePanel";
import { requestNoteReveal } from "@/features/notes/ui/noteReveal";
import { useCommonNotes } from "@/features/notes/ui/commonNotes";
import { openExternal } from "@/foundation/ui/external/native";
import { followMovedNote, useNoteActions } from "./useNoteActions";
import { revealNoteFolders } from "./useNoteFolders";

/** ノートのタブに渡すもの */
export interface NoteTabProps {
  projectId: number;
  openNote?: string;
  openNoteLine?: number;
  /** 右のタブの欄を覚える範囲（なければプロジェクト。右サイドバーのノートは、真ん中のノートのタブと別の範囲） */
  scope?: PanelScope;
  /** openNote を開いたとき（あれば URL を書き換えない。右サイドバーは頼みを片付けるだけで、画面を移らない） */
  onOpenedNote?: () => void;
}

/** ノートのタブの状態と操作（NoteTab が描く） */
export function useNoteTab({ projectId, openNote, openNoteLine, scope, onOpenedNote }: NoteTabProps) {
  const list = useNoteList(projectId);
  const panelKeyOf = notePanelKey(projectId, scope);
  // 右の欄はいつも開いておく（タブがなければ案内。欄の決まりの alwaysOpen）
  const panel = usePanel("notes", scope ?? projectId);
  // 一覧の選んでいる行 = ピントのあるペインで表示中のノート（共通のノートのこともある）
  const shown = focusedNote(panel);
  const shownPathIn = (id: number) => (shown?.projectId === id ? shown.path : "");
  const [remembered, setRemembered] = useSetting(storage.settings.selected(projectId));
  const [query, setQuery] = useState("");
  // 作ったら隠した一覧を出す（隠す・出すのは NoteSplit）
  const [, setListHidden] = useSetting(storage.settings.listHidden);
  const common = useCommonNotes();
  // 選んでいる欄（押した欄。ほかの欄で選んだ行はその欄が外す）
  const [activeSection, setActiveSection] = useState(projectId);
  // 空の画面の「新しいノート」で作ったノート（プロジェクトの欄が受け取って名前を変え始める）
  const [renameRequest, setRenameRequest] = useState<string | null>(null);

  /** ノートを右のタブの欄に開く（どの欄のノートも同じ欄に。タブは開いたノートのプロジェクトを持つ） */
  const open = (id: number, path: string, newTab: boolean) => openNoteInPanel(id, path, newTab, panelKeyOf);

  // 最後に表示したこのプロジェクトのノートを覚え、タブがないまま開いたら（アプリを開き直したとき）そのノートを開き直す
  // （覚えるのはこのプロジェクトのノートだけ。覚え直すのは表示したノートが変わったときだけ。開き直すのは一覧が届いたときだけ）
  const rememberShown = useEffectEvent((path: string) => {
    if (path !== remembered) setRemembered(path);
  });
  const shownHere = shownPathIn(projectId);
  useEffect(() => {
    if (shownHere) rememberShown(shownHere);
  }, [shownHere]);
  const entriesLoaded = list.data !== undefined;
  const reopenRemembered = useEffectEvent(() => {
    if (openNote || panel.tabs.length > 0 || !remembered) return;
    if (list.data?.entries.some((e) => e.path === remembered && !e.dir)) void open(projectId, remembered, true);
  });
  useEffect(() => {
    if (entriesLoaded) reopenRemembered();
  }, [entriesLoaded]);

  // URL で来たノート（このプロジェクトのもの）を新しいタブで開いて（開いていればそのタブ）、URL から外す（チャットの「ノートに追加」のあと）。
  // 行があれば（⌘K の「ノート内の文言」）、開いたノートでその行へ移る
  const openFromUrl = useEffectEvent((path: string, line: number | undefined) => {
    if (line) requestNoteReveal(projectId, path, line);
    void open(projectId, path, true);
    revealNoteFolders(projectId, path);
    notesStore.invalidate(projectId);
    if (onOpenedNote) onOpenedNote();
    else navigate({ name: "project", id: projectId, tab: "notes" }, { replace: true });
  });
  useEffect(() => {
    if (openNote) openFromUrl(openNote, openNoteLine);
  }, [openNote, openNoteLine]);

  // 欄でノート・フォルダを作ったら、探している文を消して一覧を出す（作った行を見せる）
  const onCreated = () => {
    setQuery("");
    setListHidden(false);
  };
  // 空の画面の「新しいノート」（このプロジェクトの根に作り、右に開いて、欄の行で名前を変え始める）
  const emptyActions = useNoteActions(projectId, {
    onCreated: (path) => {
      onCreated();
      setActiveSection(projectId);
      void open(projectId, path, true);
      setRenameRequest(path);
    },
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => followMovedNote(projectId, from, to),
  });
  const reveal = () => openExternal({ kind: "reveal", path: list.data?.dir ?? "" });
  const refresh = () => {
    notesStore.invalidate(projectId);
    if (common.state === "ready") notesStore.invalidate(common.projectId);
  };
  const hasTree = Boolean(list.data?.entries.length);
  return { activeSection, common, emptyActions, hasTree, list, onCreated, open, panel, query, refresh, renameRequest, reveal, setActiveSection, setQuery, setRenameRequest, shownPathIn };
}
