import type { MouseEvent } from "react";
import { noteExtensionOf } from "@shared/notes/kinds";
import { noteDatePrefixLength } from "@shared/notes/names";
import { isUnder } from "@shared/foundation/path";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import type { TreeNode as RowNode } from "@/foundation/ui/kit/list/tree";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { TreeView, type TreeRenaming } from "@/foundation/ui/kit/list/TreeView";
import { useTree } from "@/foundation/ui/kit/list/useTree";
import { isDraggingNote, useNoteRowDrag } from "./noteDrag";
import { noteTitle } from "@/features/notes/ui/notePaths";
import type { NoteDragData } from "./noteMoveModel";

/** 一覧の行で名前を変えているノート・フォルダ（initial: 書き直してもらうときの、前に書いた名前。round: 書き直すたびに増やして欄を作り直す） */
export interface NoteRenaming {
  path: string;
  initial?: string;
  round: number;
}

/** 押した・Space の修飾キー（⌘ / Shift ＋クリックで選ぶ） */
type Modifiers = Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">;

interface Props {
  /** 木の欄（プロジェクト。ドラッグで運ぶものに添え、ほかの欄へ落とされたら欄の間で動かす） */
  projectId: number;
  nodes: TreeNode[];
  open: ReadonlySet<string>;
  /** フォルダを開く・閉じる（← →） */
  onToggle: (path: string) => void;
  /** 閉じたフォルダを開く（ドラッグを重ねて待ったとき） */
  onExpand: (path: string) => void;
  /** 選んでいる行か（背景の色。⌘ / Shift ＋クリックで選んだいくつかの行も） */
  isSelected: (path: string) => boolean;
  /** 行を押した・Space（修飾キーを見て、選ぶ・開く・開閉するかは欄（NoteSection）が決める） */
  onRowClick: (node: TreeNode, e: Modifiers) => void;
  /** 行の右クリック（行のメニュー） */
  onMenu: (e: MouseEvent, node: TreeNode) => void;
  /** ノート・フォルダ（まとめて運んだらいくつも。ほかの欄からのこともある）を、この木のフォルダ（"" は直下）へ落とした */
  onDropInto: (drag: NoteDragData, folder: string) => void;
  /** その行をつかんだときに運ぶもの（選んだ行をつかめば、選んだものすべて） */
  dragPaths: (node: TreeNode) => string[];
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。一覧の空いている所でも付くので、欄（NoteSection）が持つ */
  dropTarget: string | null;
  onDropTarget: (folder: string | null) => void;
  /** 名前を変えている行 */
  renaming: NoteRenaming | null;
  /** 行で名前を変え始める（ダブルクリック・Enter） */
  onStartRename: (node: TreeNode) => void;
  /** 書いた名前に変える（Enter・ピントを外す） */
  onRename: (node: TreeNode, name: string) => void;
  /** 名前を変えるのをやめた（Esc・名前を変えずに決めた） */
  onRenameEnd: () => void;
}

interface NoteRow extends RowNode<string> {
  note: TreeNode;
  children?: NoteRow[];
}

const rowsOf = (nodes: readonly TreeNode[], byPath: Map<string, TreeNode>): NoteRow[] =>
  nodes.map((note) => {
    byPath.set(note.path, note);
    return { key: note.path, note, children: note.dir ? rowsOf(note.children, byPath) : undefined };
  });

/**
 * ノートのフォルダの木（土台の TreeView の上。開いているフォルダの中だけ描く）。行をドラッグしてフォルダへ落とすと動かす
 * （ファイルの行に落とすと、そのファイルのあるフォルダへ。閉じたフォルダに重ねて待つと開く。落とす先のフォルダは行と中身を染める）。右クリックで行のメニュー。
 * 押す・Space で開く / 開閉、↑↓←→ で行を移る・開閉する。ダブルクリック・Enter（と右クリックの「名前を変更」・新しく作ったとき）で、
 * 行の名前の所がそのまま入力欄になる（ノートは拡張子を除いた部分を書く）
 */
export function NoteTree({ projectId, nodes, open, onToggle, onExpand, isSelected, onRowClick, onMenu, onDropInto, dragPaths, dropTarget, onDropTarget, renaming, onStartRename, onRename, onRenameEnd }: Props) {
  const byPath = new Map<string, TreeNode>();
  const roots = rowsOf(nodes, byPath);
  // 行のドラッグ（落とす先の印・閉じたフォルダに重ねて待つと開く。入力欄の上の「ノート」の木と共通）
  const { rowProps: dragProps } = useNoteRowDrag({ projectId, isOpen: (path) => open.has(path), onExpand, onDropInto, onDropTarget, dragPaths });
  const tree = useTree<string, NoteRow>({
    roots,
    open: { isOpen: (path) => open.has(path), set: (path, next) => open.has(path) !== next && onToggle(path) },
    selection: { has: isSelected },
    onActivate: (path, e) => {
      const node = byPath.get(path);
      if (node) onRowClick(node, e);
    },
    onRename: (path) => {
      const node = byPath.get(path);
      if (node) onStartRename(node);
    },
    label: "ノート",
  });
  const renamingNode = renaming ? byPath.get(renaming.path) : undefined;
  const initial = renaming && renamingNode ? (renaming.initial ?? (renamingNode.dir ? renamingNode.name : noteTitle(renamingNode.path))) : "";
  const treeRenaming: TreeRenaming<string> | null =
    renaming && renamingNode
      ? {
          key: renaming.path,
          round: renaming.round,
          initial,
          // 頭の日付（「2026-11-09 」）は残し、後ろだけを選ぶ（すぐ書けば日付付きの名前になる）。ノートの拡張子は欄の右に添えて、書き換えさせない
          selectFrom: renamingNode.dir ? 0 : noteDatePrefixLength(initial),
          suffix: renamingNode.dir ? undefined : (noteExtensionOf(renamingNode.path) ?? undefined),
          maxLength: 200,
          submit: (name) => onRename(renamingNode, name),
          cancel: onRenameEnd,
        }
      : null;
  return (
    <TreeView<string, NoteRow>
      tree={tree}
      className="note-tree"
      renaming={treeRenaming}
      rowProps={({ key, node: { note } }) => ({
        ...dragProps(note),
        title: key,
        className: dropTarget ? (key === dropTarget ? "drop-target" : isUnder(key, dropTarget) ? "drop-inside" : undefined) : undefined,
        "data-drag-source": isDraggingNote(projectId, key) || undefined,
        onDoubleClick: () => onStartRename(note),
        onContextMenu: (e) => {
          e.stopPropagation();
          onMenu(e, note);
        },
      })}
      renderRow={(row, { nameField }) => (
        <>
          <span className="tree-chevron">{row.hasChildren && <Chevron open={row.open} />}</span>
          <FileIcon name={row.node.note.name} dir={row.node.note.dir} open={row.open || row.key === dropTarget} />
          {nameField ?? <span className="tree-name">{row.node.note.name}</span>}
        </>
      )}
    />
  );
}
