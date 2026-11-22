import type { CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { AddToChat } from "@/foundation/ui/kit/icons";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { Collapse } from "@/foundation/ui/kit/Collapse";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { OpenPlaceButtons, type OpenPlace } from "@/features/chat/ui";
import { isDraggingNote, useNoteRowDrag } from "./noteDrag";

interface Props {
  nodes: TreeNode[];
  /** 開いているフォルダ（ノートのタブと同じ覚え方） */
  open: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** 閉じたフォルダを開く（ドラッグを重ねて待ったとき） */
  onExpand: (path: string) => void;
  /** ノート・フォルダを、フォルダ（"" は直下）へ落とした */
  onDropInto: (paths: string[], folder: string) => void;
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。木の段をまたいで 1 つなので、NoteChip が持つ */
  dropTarget: string | null;
  onDropTarget: (folder: string | null) => void;
  /** ノートを開く（place を省けば設定の開き方） */
  onOpen: (path: string, place?: "side" | "window") => void;
  /** ノートを開かずに、このチャットの入力欄に追加する（押した時点の写しの札） */
  onAttach: (path: string) => void;
  /** 行の右の「右で開く」「新規ウィンドウで開く」 */
  places: readonly OpenPlace[];
  depth?: number;
}

/**
 * 入力欄の上の「ノート」の一覧の木（ノートのタブと同じフォルダの並び。開いているフォルダの中だけ描き、開閉は高さをなめらかに変える `Collapse`）。
 * フォルダの行は押すと開閉し、ノートの行は押すと開く。ノートの行の右に「このチャットに追加」と開く場所のボタン。
 * 行をドラッグしてフォルダへ落とすと動かす（ノートのタブの木と同じ `useNoteRowDrag`。落とす先のフォルダは行と中身をまとめて囲む）
 */
export function NoteChipTree(props: Props) {
  const { nodes, open, onToggle, onExpand, onDropInto, dropTarget, onDropTarget, onOpen, onAttach, places, depth = 0 } = props;
  const { rowProps } = useNoteRowDrag({ isOpen: (path) => open.has(path), onExpand, onDropInto, onDropTarget });
  return (
    <ul className="note-chip-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const style = { "--depth": depth } as CSSProperties;
        if (node.dir) {
          const isOpen = open.has(node.path);
          const isDropTarget = dropTarget === node.path;
          return (
            <li key={node.path} role="treeitem" aria-expanded={isOpen} className={cx("note-chip-item", isDropTarget && "drop-target")}>
              <button
                type="button"
                className="note-chip-row tree-indent note-chip-dir"
                data-drag-source={isDraggingNote(node.path) ? "" : undefined}
                style={style}
                title={node.path}
                onClick={() => onToggle(node.path)}
                {...rowProps(node)}
              >
                <Chevron open={isOpen} />
                <FileIcon name={node.name} dir open={isOpen || isDropTarget} />
                <span className="note-chip-title">{node.name}</span>
              </button>
              {/* 開閉で高さをなめらかに変える（ノートのタブの木と同じ動き） */}
              <Collapse open={isOpen}>
                <NoteChipTree {...props} nodes={node.children} depth={depth + 1} />
              </Collapse>
            </li>
          );
        }
        return (
          <li key={node.path} role="treeitem" className="note-chip-item">
            <div
              role="button"
              tabIndex={0}
              className="note-chip-row tree-indent"
              data-drag-source={isDraggingNote(node.path) ? "" : undefined}
              style={style}
              title={node.path}
              onClick={() => onOpen(node.path)}
              onKeyDown={(k) => k.key === "Enter" && onOpen(node.path)}
              {...rowProps(node)}
            >
              {/* フォルダの行の開閉の矢印の分だけ空けて、名前の頭をそろえる */}
              <span className="note-chip-indent" aria-hidden />
              <FileIcon name={node.name} />
              <span className="note-chip-title">{node.name}</span>
              <IconButton
                type="button"
                icon={AddToChat}
                iconSize={13}
                label="このチャットに追加"
                title="ノートを開かずに、押した時点の中身をこのチャットの入力欄に札で足します"
                className="open-place-button note-chip-attach"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onAttach(node.path);
                }}
              />
              <OpenPlaceButtons places={places} onOpen={(place) => onOpen(node.path, place === "window" ? "window" : "side")} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
