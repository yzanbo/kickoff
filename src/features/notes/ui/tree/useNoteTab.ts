// ノートのタブの状態と操作（一覧・選択・名前を変える・ドラッグ・URL の頼み。描くのは NoteTab）
import { useEffect, useEffectEvent, useState, type MouseEvent } from "react";
import { navigate } from "@/foundation/ui/navigation/router";
import { filesSettings } from "@/features/files/ui";
import { storage } from "@/features/notes/ui/storage";
import { useNoteFolders } from "./useNoteFolders";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useMultiSelect } from "@/foundation/ui/hooks/useMultiSelect";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { notesStore, useNoteList } from "@/features/notes/ui/store";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { folderPaths, topLevelPaths, visibleTreePaths, type TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { focusedPane, mapTabs, usePanel, type PanelScope } from "@/features/panel/ui";
import { ancestorsOf } from "@shared/foundation/path";
import { buildNoteTree, filterNotes, parentOf } from "@/features/notes/ui/notePaths";
import type { NoteMenuTarget } from "./NoteListMenu";
import type { NoteRenaming } from "./NoteTree";
import { confirmLeaveNotesUnder } from "@/features/notes/ui/noteLeave";
import { notePanelKey, openNoteInPanel, trashedNoteTab } from "@/features/notes/ui/notePanel";
import { requestNoteReveal } from "@/features/notes/ui/noteReveal";
import { followMovedNote, useNoteActions } from "./useNoteActions";
import { openExternal } from "@/foundation/ui/external/native";

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
  // 一覧の選んでいる行 = ピントのあるペインで表示中のノート
  const focusedTab = panel.tabs.find((t) => t.key === focusedPane(panel.layout).active);
  const selected = focusedTab?.kind === "note" ? focusedTab.path : "";
  // 一覧で選んでいる行（背景の色。フォルダも選べ、一覧の空いている所を押すと外れる。VS Code のエクスプローラーと同じ）。
  // null = 表示中のノートに合わせる、"" = 何も選んでいない、パス = 押したフォルダ。表示中のノートが変わったら、それに合わせ直す
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [selected]);
  const highlighted = picked ?? selected;
  const [remembered, setRemembered] = useSetting(storage.settings.selected(projectId));
  const folders = useNoteFolders(projectId);
  const [query, setQuery] = useState("");
  const menu = useContextMenu<NoteMenuTarget>();
  // 左の一覧の幅（エディタ・履歴タブと同じ幅を覚える）
  const { paneRef: widthPaneRef, ...width } = useDragSize({ setting: filesSettings.listWidth, min: 200, keep: 320 });
  const [listHidden, setListHidden] = useSetting(storage.settings.listHidden);
  // ドラッグを重ねている落とす先のフォルダ（"" は直下 = 一覧ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 一覧の行で名前を変えているノート・フォルダ（新しく作ったとき・ダブルクリック・右クリックの「名前を変更」）
  const [renaming, setRenaming] = useState<NoteRenaming | null>(null);
  const startRename = (path: string) => setRenaming({ path, round: 0 });

  const entries = list.data?.entries;
  const tree = buildNoteTree(entries ?? []);
  // 木のフォルダ（すべて開く・閉じるの切り替えに使う。覚えた開閉には、もうないフォルダも残っていることがあるので木から数える）
  const dirs = folderPaths(tree);
  const found = (query.trim() ? filterNotes(entries ?? [], query) : null);
  const dir = list.data?.dir ?? "";
  // ⌘ / Shift ＋クリックで選んだいくつかの行（Finder と同じ。範囲は見えている並び = 探していれば見つかった順、ふだんは開いているフォルダの中までの木の順）
  const allPaths = (entries ?? []).map((e) => e.path);
  const multi = useMultiSelect(allPaths, () => (found ? found.map((e) => e.path) : visibleTreePaths(tree, folders.open)));
  const isSelected = (path: string) => (multi.selected.length > 0 ? multi.has(path) : highlighted === path);
  const nodesOf = (paths: readonly string[]) => paths.map((path) => ({ path, dir: entries?.find((e) => e.path === path)?.dir ?? false }));

  // ノートを開く（newTab = 新しいタブ。ふだんはピントのあるペインで表示中のノートを入れ替える。そのときは書きかけをどうするか聞く）
  const select = async (path: string, newTab = false) => {
    await openNoteInPanel(projectId, path, newTab, panelKeyOf);
    folders.expand(ancestorsOf(path));
  };

  // 最後に表示したノートを覚え、タブがないまま開いたら（アプリを開き直したとき）そのノートを開き直す（覚え直すのは表示したノートが変わったときだけ。開き直すのは一覧が届いたときだけ）
  const rememberShown = useEffectEvent((path: string) => {
    if (path !== remembered) setRemembered(path);
  });
  useEffect(() => {
    if (selected) rememberShown(selected);
  }, [selected]);
  const entriesLoaded = list.data !== undefined;
  const reopenRemembered = useEffectEvent(() => {
    if (openNote || panel.tabs.length > 0 || !remembered) return;
    if (list.data?.entries.some((e) => e.path === remembered && !e.dir)) void openNoteInPanel(projectId, remembered, true, panelKeyOf);
  });
  useEffect(() => {
    if (entriesLoaded) reopenRemembered();
  }, [entriesLoaded]);

  // URL で来たノートを新しいタブで開いて（開いていればそのタブ）、URL から外す（チャットの「ノートに追加」のあと）。
  // 行があれば（⌘K の「ノート内の文言」）、開いたノートでその行へ移る
  const openFromUrl = useEffectEvent((path: string, line: number | undefined) => {
    if (line) requestNoteReveal(projectId, path, line);
    void select(path, true);
    notesStore.invalidate(projectId);
    if (onOpenedNote) onOpenedNote();
    else navigate({ name: "project", id: projectId, tab: "notes" }, { replace: true });
  });
  useEffect(() => {
    if (openNote) openFromUrl(openNote, openNoteLine);
  }, [openNote, openNoteLine]);

  /** 名前を変えた・動かした（開いているノート・フォルダのパスを付け替える。一覧の操作と、題名での名前の変更・AI の整理案のまとめての移動で共通） */
  const moved = (from: string, to: string) => followMovedNote(projectId, from, to);

  const actions = useNoteActions(projectId, {
    // 作ったら、探している文を消して一覧のその行を見せ、名前を変え始める（ノートは右に開く）
    onCreated: (path, isDir) => {
      setQuery("");
      setListHidden(false);
      if (isDir) {
        folders.expand(ancestorsOf(path));
        setPicked(path);
      } else void select(path, true);
      startRename(path);
    },
    // 開いているノート（とその入ったフォルダ）の名前を変える・動かす・ゴミ箱に入れる前も聞く（右の欄・別ウィンドウで開いているものも）
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => moved(from, to),
    onTrashed: (path) => {
      mapTabs("note", trashedNoteTab(projectId, path));
      // まとめてゴミ箱に入れると続けて呼ばれるので、いま覚えている値から外す
      folders.forget(path);
    },
  });

  // 行で書いた名前に変える。同じ名前があれば、書いた名前のまま欄を開き直して書き直してもらう
  const rename = async (node: TreeNode, name: string) => {
    const result = await actions.renameTo(node.path, node.dir, name);
    setRenaming((r) => (result === "taken" && r?.path === node.path ? { path: node.path, initial: name, round: r.round + 1 } : null));
  };

  // AI でフォルダを整理するダイアログ
  const [planning, setPlanning] = useState(false);
  const hasNotes = Boolean(entries?.some((e) => !e.dir));

  // 新しいノート・フォルダを作る場所: 右クリックした行（フォルダならその中、ノートならその入ったフォルダ）、なければ一覧で選んでいる行
  // （フォルダならその中、ノートならその入ったフォルダ。何も選んでいなければ、いちばん外側）
  const folderForNew = (node: TreeNode | null) => {
    if (node) return node.dir ? node.path : parentOf(node.path);
    if (!highlighted) return "";
    return entries?.find((e) => e.path === highlighted)?.dir ? highlighted : parentOf(highlighted);
  };
  const reveal = (path: string) => openExternal({ kind: "reveal", path: path ? `${dir}/${path}` : dir });

  // 行を押した: ⌘ / Shift なら選ぶだけ（まだ何も選んでいなければ、いま選んでいる行も入れる）。ふつうのクリックは選んだものを外し、ノートは開き、フォルダは開閉して選ぶ
  const rowClick = (path: string, isDir: boolean, e: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">) => {
    if (multi.click(e, path, highlighted || null)) return;
    if (isDir) {
      setPicked(path);
      folders.toggle(path);
    } else {
      setPicked(null);
      void select(path);
    }
  };
  // 右クリック: 選んだいくつかの行の 1 つなら、選んでいるものすべてのメニュー。ほかの行なら選んだものを外して、その行のメニュー
  const rowMenu = (e: MouseEvent, node: TreeNode) => {
    e.stopPropagation();
    if (multi.has(node.path) && multi.selected.length > 1) return menu.open(e, { node, many: nodesOf(multi.selected) });
    multi.clear();
    menu.open(e, { node, many: null });
  };
  // 選んだ行をつかめば、選んでいるものすべてを運ぶ（フォルダとその中を両方選んでいれば、フォルダだけ）
  const dragPaths = (node: TreeNode) => (multi.has(node.path) && multi.selected.length > 1 ? topLevelPaths(multi.selected) : [node.path]);
  const dropInto = (paths: string[], folder: string) => void actions.moveAllInto(paths, folder);
  const openInNewTabs = async (paths: string[]) => {
    for (const path of paths) await openNoteInPanel(projectId, path, true, panelKeyOf);
  };
  return { actions, dir, dirs, dragPaths, dropInto, dropTarget, folderForNew, folders, found, hasNotes, isSelected, list, listHidden, menu, multi, openInNewTabs, panel, planning, query, rename, renaming, reveal, rowClick, rowMenu, setDropTarget, setListHidden, setPicked, setPlanning, setQuery, setRenaming, startRename, tree, width, widthPaneRef };
}
