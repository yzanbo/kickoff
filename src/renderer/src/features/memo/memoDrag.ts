import { useEffect, useRef, type DragEvent, type HTMLAttributes } from "react";
import type { TreeNode } from "@/features/editor/treeModel";
import { parentOf } from "./memoPaths";
import { startDragGhost } from "@/ui/dragGhost";

/** ドラッグで運ぶメモのパスの種類（ほかのドラッグと見分ける。中身はパスの JSON の配列） */
export const MEMO_DRAG_TYPE = "application/x-kickoff-memo";

/** ドラッグで運んでいるメモか */
export const isMemoDrag = (e: DragEvent) => e.dataTransfer.types.includes(MEMO_DRAG_TYPE);

/** いま運んでいるメモ・フォルダのパス（一覧で選んだものをまとめて運ぶこともある。dragover の間は運ぶ中身を読めないので、つかんだときに覚える。空 = 運んでいない） */
let draggingPaths: readonly string[] = [];

/** その行を運んでいるか（運んでいる行は薄くする） */
export const isDraggingMemo = (path: string) => draggingPaths.includes(path);

/** 落としたものから、運んできたパスを読む */
function droppedPaths(e: DragEvent): string[] {
  const raw = e.dataTransfer.getData(MEMO_DRAG_TYPE);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 運んでいるものを folder（"" は直下）へ落とせるか。自分自身・自分の中のフォルダには入れられず（まとめて運んでいれば、どれか 1 つでも）、
 * どれもいまあるフォルダなら落としても何も変わらないので、どちらも落とす先として示さない（ほかのウィンドウから運んできたなど、何を運んでいるか分からないときは落とせることにする）
 */
export function canDropInto(folder: string): boolean {
  if (draggingPaths.length === 0) return true;
  if (draggingPaths.some((p) => folder === p || folder.startsWith(`${p}/`))) return false;
  return draggingPaths.some((p) => parentOf(p) !== folder);
}

/** ドラッグを閉じたフォルダに重ねたまま、このくらい待つと開く（Finder と同じく、奥のフォルダへも落とせるように） */
const SPRING_OPEN_MS = 700;

interface DropHandlers {
  /** メモ・フォルダ（まとめて運んだらいくつも）を、フォルダ（"" は直下）へ落とした */
  onDropInto: (paths: string[], folder: string) => void;
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。木の段をまたいで 1 つなので、一覧の持ち主が持つ */
  onDropTarget: (folder: string | null) => void;
}

type DragProps = Pick<HTMLAttributes<HTMLElement>, "draggable" | "onDragStart" | "onDragEnd" | "onDragOver" | "onDragLeave" | "onDrop">;

interface RowDragOptions extends DropHandlers {
  isOpen: (path: string) => boolean;
  onExpand: (path: string) => void;
  /** その行をつかんだときに運ぶもの（メモのタブの一覧で選んだ行をつかめば、選んだものすべて。省けばその行だけ） */
  dragPaths?: (node: TreeNode) => string[];
}

/**
 * メモの木の行のドラッグ（メモのタブの木 `MemoTree` と入力欄の上の「メモ」の木 `MemoChipTree` で共通）。行をつかんでフォルダへ落とすと動かす
 * （ファイルの行に落とすと、そのファイルのあるフォルダへ。閉じたフォルダに重ねて待つと開く）。返す `rowProps(node)` を行の要素に広げる
 */
export function useMemoRowDrag({ isOpen, onExpand, onDropInto, onDropTarget, dragPaths }: RowDragOptions) {
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
      e.dataTransfer.setData(MEMO_DRAG_TYPE, JSON.stringify(paths));
      e.dataTransfer.effectAllowed = "move";
      draggingPaths = paths;
      // 半透明の写しがカーソルに付いて動く（下の落とし先のフォルダの枠が透ける。まとめて運ぶときは右上に「n 件」）
      startDragGhost(e, { count: paths.length });
    },
    onDragEnd: () => {
      draggingPaths = [];
      onDropTarget(null);
      stopSpring();
    },
    onDragOver: (e) => {
      if (!isMemoDrag(e)) return;
      e.stopPropagation();
      const folder = folderOfNode(node);
      // 落とせない所（自分自身・自分の中・いまあるフォルダ）は、印を付けず、カーソルも「落とせない」にする
      if (!canDropInto(folder)) {
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
      const paths = droppedPaths(e);
      draggingPaths = [];
      onDropTarget(null);
      stopSpring();
      if (paths.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      onDropInto(paths, folderOfNode(node));
    },
  });
  return { rowProps };
}

/** 一覧の空いている所（木の外側）へ落とすと、いちばん上（直下）へ動かす。一覧の入れ物に広げる（行の上は行が受け取る） */
export function memoListDropProps({ onDropInto, onDropTarget }: DropHandlers): Omit<DragProps, "draggable" | "onDragStart" | "onDragEnd"> {
  return {
    onDragOver: (e) => {
      if (!isMemoDrag(e)) return;
      if (!canDropInto("")) {
        e.dataTransfer.dropEffect = "none";
        onDropTarget(null);
        return;
      }
      e.preventDefault();
      onDropTarget("");
    },
    onDragLeave: (e) => {
      // 一覧の中の行へ移っただけなら、行が付け直す
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDropTarget(null);
    },
    onDrop: (e) => {
      onDropTarget(null);
      const paths = droppedPaths(e);
      if (paths.length === 0) return;
      e.preventDefault();
      onDropInto(paths, "");
    },
  };
}
