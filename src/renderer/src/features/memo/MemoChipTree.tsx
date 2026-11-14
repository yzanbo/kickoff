import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { AddToChat } from "@/ui/icons";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { OpenPlaceButtons, type OpenPlace } from "@/features/chat/composer/OpenPlaceControls";
import { isDraggingMemo, useMemoRowDrag } from "./memoDrag";

interface Props {
  nodes: TreeNode[];
  /** 開いているフォルダ（メモのタブと同じ覚え方） */
  open: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** 閉じたフォルダを開く（ドラッグを重ねて待ったとき） */
  onExpand: (path: string) => void;
  /** メモ・フォルダを、フォルダ（"" は直下）へ落とした */
  onDropInto: (paths: string[], folder: string) => void;
  /** ドラッグを重ねている落とす先のフォルダ（"" は直下。null は重ねていない）。木の段をまたいで 1 つなので、MemoChip が持つ */
  dropTarget: string | null;
  onDropTarget: (folder: string | null) => void;
  /** メモを開く（place を省けば設定の開き方） */
  onOpen: (path: string, place?: "side" | "window") => void;
  /** メモを開かずに、このチャットの入力欄に追加する（押した時点の写しの札） */
  onAttach: (path: string) => void;
  /** 行の右の「右で開く」「新規ウィンドウで開く」 */
  places: readonly OpenPlace[];
  depth?: number;
}

/**
 * 入力欄の上の「メモ」の一覧の木（メモのタブと同じフォルダの並び。開いているフォルダの中だけ描き、開閉は高さをなめらかに変える `Collapse`）。
 * フォルダの行は押すと開閉し、メモの行は押すと開く。メモの行の右に「このチャットに追加」と開く場所のボタン。
 * 行をドラッグしてフォルダへ落とすと動かす（メモのタブの木と同じ `useMemoRowDrag`。落とす先のフォルダは行と中身をまとめて囲む）
 */
export function MemoChipTree(props: Props) {
  const { nodes, open, onToggle, onExpand, onDropInto, dropTarget, onDropTarget, onOpen, onAttach, places, depth = 0 } = props;
  const { rowProps } = useMemoRowDrag({ isOpen: (path) => open.has(path), onExpand, onDropInto, onDropTarget });
  return (
    <ul className="memo-chip-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const style = { "--depth": depth } as CSSProperties;
        if (node.dir) {
          const isOpen = open.has(node.path);
          const isDropTarget = dropTarget === node.path;
          return (
            <li key={node.path} role="treeitem" aria-expanded={isOpen} className={cx("memo-chip-item", isDropTarget && "drop-target")}>
              <button
                type="button"
                className={cx("memo-chip-row", "memo-chip-dir", isDraggingMemo(node.path) && "dragging")}
                style={style}
                title={node.path}
                onClick={() => onToggle(node.path)}
                {...rowProps(node)}
              >
                <Chevron open={isOpen} />
                <FileIcon name={node.name} dir open={isOpen || isDropTarget} />
                <span className="memo-chip-title">{node.name}</span>
              </button>
              {/* 開閉で高さをなめらかに変える（メモのタブの木と同じ動き） */}
              <Collapse open={isOpen}>
                <MemoChipTree {...props} nodes={node.children} depth={depth + 1} />
              </Collapse>
            </li>
          );
        }
        return (
          <li key={node.path} role="treeitem" className="memo-chip-item">
            <div
              role="button"
              tabIndex={0}
              className={cx("memo-chip-row", isDraggingMemo(node.path) && "dragging")}
              style={style}
              title={node.path}
              onClick={() => onOpen(node.path)}
              onKeyDown={(k) => k.key === "Enter" && onOpen(node.path)}
              {...rowProps(node)}
            >
              {/* フォルダの行の開閉の矢印の分だけ空けて、名前の頭をそろえる */}
              <span className="memo-chip-indent" aria-hidden />
              <FileIcon name={node.name} />
              <span className="memo-chip-title">{node.name}</span>
              <IconButton
                type="button"
                icon={AddToChat}
                size={13}
                label="このチャットに追加"
                title="メモを開かずに、押した時点の中身をこのチャットの入力欄に札で足します"
                className="open-place-button memo-chip-attach"
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
