// ノートの欄 1 つの状態と操作（1 つのプロジェクト = 1 つのノートのフォルダの木。選択・複数選択・開いているフォルダ・新規作成の場所・名前の変更・ドラッグ。描くのは NoteSection）
import { useEffect, useEffectEvent, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ancestorsOf } from "@shared/foundation/path";
import { useFold } from "@/foundation/ui/hooks/useFold";
import { useMultiSelect } from "@/foundation/ui/hooks/useMultiSelect";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { folderPaths, topLevelPaths, visibleTreePaths, type TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { openExternal } from "@/foundation/ui/external/native";
import { mapTabs } from "@/features/panel/ui";
import { useNoteList } from "@/features/notes/ui/store";
import { buildNoteTree, filterNotes, parentOf } from "@/features/notes/ui/notePaths";
import { confirmLeaveNotesUnder } from "@/features/notes/ui/noteLeave";
import { trashedNoteTab } from "@/features/notes/ui/notePanel";
import { useNoteFolders } from "./useNoteFolders";
import { followMovedNote, useNoteActions } from "./useNoteActions";
import { dropNotes, transferNotes } from "./noteTransfer";
import type { NoteDragData } from "./noteMoveModel";
import type { NoteMenuTarget, NoteMoveTarget } from "./NoteListMenu";
import type { NoteRenaming } from "./NoteTree";

/** 欄の開閉の覚え方（hooks/useFold の場所とキー。defaultOpen: 覚えていないときに開いているか） */
export interface NoteSectionFold {
  place: string;
  key: string;
  defaultOpen?: boolean;
}

/** ノートの欄に渡すもの（どの画面に置くかは持たない。開く先・選んでいる欄・行き先の欄は置く側が渡す） */
export interface NoteSectionProps {
  /** 欄のプロジェクト（共通のノートなら見えないプロジェクト） */
  projectId: number;
  /** 見出しの名前とアイコン */
  title: string;
  icon: LucideIcon;
  fold: NoteSectionFold;
  /** ピントのあるペインで表示中のノートのパス（ほかの欄のノートなら ""） */
  shownPath: string;
  /** ノートを開く（newTab: 新しいタブ。ふだんはピントのあるペインで表示中のノートを入れ替え、書きかけをどうするか聞く） */
  onOpen: (projectId: number, path: string, newTab: boolean) => Promise<void>;
  /** 名前で探す文（置く側が 1 つ持ち、どの欄も同じ文で絞る） */
  query: string;
  /** 選んでいる欄か（ほかの欄を押したら、この欄で選んだ行を外す。キー操作の行き先はピントのある木） */
  active: boolean;
  onActivate: () => void;
  /** ノート・フォルダを作った（探している文を消す・隠した一覧を出す） */
  onCreated?: () => void;
  /** 右クリックの「〜へ移す」の行き先 */
  moveTargets: readonly NoteMoveTarget[];
  /** ノートがないときの案内 */
  emptyHint: string;
  /** 欄の外（空の画面の「新しいノート」）で作ったノートの、名前を変え始める頼み。受け取ったら onRenameRequestTaken */
  renameRequest?: string | null;
  onRenameRequestTaken?: () => void;
}

/** ノートの欄の状態と操作（NoteSection が描く） */
export function useNoteSection(props: NoteSectionProps) {
  const { projectId, shownPath, query, active, onOpen } = props;
  const list = useNoteList(projectId);
  // 欄で選んでいる行（null = 表示中のノートに合わせる、"" = 何も選んでいない、パス = 押したフォルダ）。表示中のノートが変わったら合わせ直す
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [shownPath]);
  const highlighted = picked ?? shownPath;
  const folders = useNoteFolders(projectId);
  const menu = useContextMenu<NoteMenuTarget>();
  // ドラッグを重ねている落とす先のフォルダ（"" は欄の根 = 欄ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<NoteRenaming | null>(null);
  const startRename = (path: string) => setRenaming({ path, round: 0 });
  // 探している間は、閉じた欄も開いて見つかったものを見せる
  const fold = useFold(props.fold.place, props.fold.key, { defaultOpen: props.fold.defaultOpen, forceOpen: query.trim() !== "" });
  const [planning, setPlanning] = useState(false);

  const entries = list.data?.entries;
  const tree = buildNoteTree(entries ?? []);
  const dirs = folderPaths(tree);
  const found = query.trim() ? filterNotes(entries ?? [], query) : null;
  const dir = list.data?.dir ?? "";
  const hasNotes = Boolean(entries?.some((e) => !e.dir));
  const allPaths = (entries ?? []).map((e) => e.path);
  const multi = useMultiSelect(allPaths, () => (found ? found.map((e) => e.path) : visibleTreePaths(tree, folders.open)));
  const isSelected = (path: string) => (multi.selected.length > 0 ? multi.has(path) : highlighted === path);
  const nodesOf = (paths: readonly string[]) => paths.map((path) => ({ path, dir: entries?.find((e) => e.path === path)?.dir ?? false }));
  const clearPicks = () => {
    setPicked("");
    multi.clear();
  };

  // ほかの欄を押したら、この欄で選んだフォルダ・いくつかの行を外す（選んでいる行が欄をまたいで残らないように）
  const leave = useEffectEvent(() => {
    setPicked(null);
    multi.clear();
  });
  useEffect(() => {
    if (!active) leave();
  }, [active]);

  const select = async (path: string, newTab = false) => {
    await onOpen(projectId, path, newTab);
    folders.expand(ancestorsOf(path));
  };

  const actions = useNoteActions(projectId, {
    // 作ったら、欄を開いてその行を見せ、名前を変え始める（ノートは右に開く）
    onCreated: (path, isDir) => {
      props.onCreated?.();
      fold.set(true);
      if (isDir) {
        folders.expand(ancestorsOf(path));
        setPicked(path);
      } else void select(path, true);
      startRename(path);
    },
    // 開いているノート（とその入ったフォルダ）の名前を変える・動かす・ゴミ箱に入れる前も聞く（右の欄・別ウィンドウで開いているものも）
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => followMovedNote(projectId, from, to),
    onTrashed: (path) => {
      mapTabs("note", trashedNoteTab(projectId, path));
      // まとめてゴミ箱に入れると続けて呼ばれるので、いま覚えている値から外す
      folders.forget(path);
    },
  });

  // 欄の外で作ったノートの名前を変え始める（一覧が届く前でも、届いて行ができたら欄になる）
  const takeRenameRequest = useEffectEvent((path: string) => {
    fold.set(true);
    startRename(path);
    props.onRenameRequestTaken?.();
  });
  useEffect(() => {
    if (props.renameRequest) takeRenameRequest(props.renameRequest);
  }, [props.renameRequest]);

  // 行で書いた名前に変える。同じ名前があれば、書いた名前のまま欄を開き直して書き直してもらう
  const rename = async (node: TreeNode, name: string) => {
    const result = await actions.renameTo(node.path, node.dir, name);
    setRenaming((r) => (result === "taken" && r?.path === node.path ? { path: node.path, initial: name, round: r.round + 1 } : null));
  };

  // 新しいノート・フォルダを作る場所: 右クリックした行（フォルダならその中、ノートならその入ったフォルダ）、なければ欄で選んでいる行（同じ決まり。何も選んでいなければ欄の根）
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
  // 落とした: 同じ欄なら動かす、ほかの欄からならノートのチャットごと移す
  const dropInto = (drag: NoteDragData, folder: string) => dropNotes(projectId, actions.moveAllInto, drag, folder);
  const moveTo = (target: number, nodes: readonly { path: string }[]) => {
    multi.clear();
    void transferNotes(projectId, nodes.map((n) => n.path), target, "");
  };
  const openInNewTabs = async (paths: string[]) => {
    for (const path of paths) await onOpen(projectId, path, true);
  };
  return { actions, clearPicks, dir, dirs, dragPaths, dropInto, dropTarget, fold, folderForNew, folders, found, hasNotes, isSelected, list, menu, moveTo, multi, openInNewTabs, planning, rename, renaming, reveal, rowClick, rowMenu, setDropTarget, setPlanning, setRenaming, startRename, tree };
}
