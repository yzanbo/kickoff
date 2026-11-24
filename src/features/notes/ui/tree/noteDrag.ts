import { useEffect, useRef, type DragEvent, type HTMLAttributes } from "react";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { parentOf } from "@/features/notes/ui/notePaths";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { canDropNotes, type NoteDragData } from "./noteMoveModel";

/** ドラッグで運ぶノートの種類（ほかのドラッグと見分ける。中身は NoteDragData の JSON） */
const NOTE_DRAG_TYPE = "application/x-kickoff-note";

/** ドラッグで運んでいるノートか */
const isNoteDrag = (e: DragEvent) => e.dataTransfer.types.includes(NOTE_DRAG_TYPE);

/** いま運んでいるノート・フォルダ（dragover の間は運ぶ中身を読めないので、つかんだときに覚える。null = 運んでいない） */
let dragging: NoteDragData | null = null;

/** その欄のその行を運んでいるか（運んでいる行は薄くする） */
export const isDraggingNote = (projectId: number, path: string) => dragging?.projectId === projectId && dragging.paths.includes(path);

/** 落としたものから、運んできた欄とパスを読む（読めなければ null） */
function droppedNotes(e: DragEvent): NoteDragData | null {
  const raw = e.dataTransfer.getData(NOTE_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { projectId, paths } = parsed as Record<string, unknown>;
    if (typeof projectId !== "number" || !Array.isArray(paths)) return null;
    const strings = paths.filter((p): p is string => typeof p === "string");
    return strings.length > 0 ? { projectId, paths: strings } : null;
  } catch {
    return null;
  }
}

/** ドラッグを閉じたフォルダに重ねたまま、このくらい待つと開く（Finder と同じく、奥のフォルダへも落とせるように） */
const SPRING_OPEN_MS = 700;

interface DropHandlers {
  /** 落とす先の欄（プロジェクト。ほかの欄から運んできたら欄の間で動かす） */
  projectId: number;
  /** ノート・フォルダ（まとめて運んだらいくつも。ほかの欄からのこともある）を、この欄のフォルダ（"" は根）へ落とした */
  onDropInto: (drag: NoteDragData, folder: string) => void;
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。木の段をまたいで 1 つなので、一覧の持ち主が持つ */
  onDropTarget: (folder: string | null) => void;
}

type DragProps = Pick<HTMLAttributes<HTMLElement>, "draggable" | "onDragStart" | "onDragEnd" | "onDragOver" | "onDragLeave" | "onDrop">;

interface RowDragOptions extends DropHandlers {
  isOpen: (path: string) => boolean;
  onExpand: (path: string) => void;
  /** その行をつかんだときに運ぶもの（ノートのタブの一覧で選んだ行をつかめば、選んだものすべて。省けばその行だけ） */
  dragPaths?: (node: TreeNode) => string[];
}

/**
 * ノートの木の行のドラッグ（ノートのタブの木 `NoteTree` と入力欄の上の「ノート」の木 `NoteChipTree` で共通）。行をつかんでフォルダへ落とすと動かす
 * （ファイルの行に落とすと、そのファイルのあるフォルダへ。閉じたフォルダに重ねて待つと開く）。返す `rowProps(node)` を行の要素に広げる
 */
export function useNoteRowDrag({ projectId, isOpen, onExpand, onDropInto, onDropTarget, dragPaths }: RowDragOptions) {
  const folderOfNode = (node: TreeNode) => (node.dir ? node.path : parentOf(node.path));
  // 閉じたフォルダにドラッグを重ねて待ったら開く
  const spring = useRef<{ path: string; timer: number } | null>(null);
  const stopSpring = () => {
    if (spring.current) window.clearTimeout(spring.current.timer);
    spring.current = null;
  };
  const startSpring = (node: TreeNode) => {
    if (!node.dir || isOpen(node.path) || spring.current?.path === node.path) return;
    stopSpring();
    spring.current = { path: node.path, timer: window.setTimeout(() => onExpand(node.path), SPRING_OPEN_MS) };
  };
  useEffect(() => stopSpring, []);

  const rowProps = (node: TreeNode): DragProps => ({
    draggable: true,
    onDragStart: (e) => {
      const paths = dragPaths?.(node) ?? [node.path];
      const data: NoteDragData = { projectId, paths };
      e.dataTransfer.setData(NOTE_DRAG_TYPE, JSON.stringify(data));
      e.dataTransfer.effectAllowed = "move";
      dragging = data;
      // 半透明の写しがカーソルに付いて動く（下の落とし先のフォルダの枠が透ける。まとめて運ぶときは右上に「n 件」）
      startDragGhost(e, { count: paths.length });
    },
    onDragEnd: () => {
      dragging = null;
      onDropTarget(null);
      stopSpring();
    },
    onDragOver: (e) => {
      if (!isNoteDrag(e)) return;
      e.stopPropagation();
      const folder = folderOfNode(node);
      // 落とせない所（同じ欄の自分自身・自分の中・いまあるフォルダ）は、印を付けず、カーソルも「落とせない」にする
      if (!canDropNotes(dragging, projectId, folder)) {
        e.dataTransfer.dropEffect = "none";
        onDropTarget(null);
        stopSpring();
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDropTarget(folder);
      startSpring(node);
    },
    onDragLeave: (e) => {
      // 行の中のアイコン・名前へ移っただけなら、重ねたまま（待つ時間をやり直さない）。落とす先の印は、次に重ねた所（行・一覧）が付け直す
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      stopSpring();
    },
    onDrop: (e) => {
      const drag = droppedNotes(e);
      dragging = null;
      onDropTarget(null);
      stopSpring();
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      onDropInto(drag, folderOfNode(node));
    },
  });
  return { rowProps };
}

/** 欄の見出し・空いている所（木の外側）へ落とすと、欄の根へ動かす。欄の入れ物に広げる（行の上は行が受け取る） */
export function noteListDropProps({ projectId, onDropInto, onDropTarget }: DropHandlers): Omit<DragProps, "draggable" | "onDragStart" | "onDragEnd"> {
  return {
    onDragOver: (e) => {
      if (!isNoteDrag(e)) return;
      if (!canDropNotes(dragging, projectId, "")) {
        e.dataTransfer.dropEffect = "none";
        onDropTarget(null);
        return;
      }
      e.preventDefault();
      // 欄の中の入れ物に重ねて置くこともある（入力欄の上の一覧）ので、外側の欄へは伝えない
      e.stopPropagation();
      onDropTarget("");
    },
    onDragLeave: (e) => {
      // 一覧の中の行へ移っただけなら、行が付け直す
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDropTarget(null);
    },
    onDrop: (e) => {
      onDropTarget(null);
      const drag = droppedNotes(e);
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      onDropInto(drag, "");
    },
  };
}
