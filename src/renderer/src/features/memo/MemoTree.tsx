import { useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { parentOf } from "./memoPaths";

/** ドラッグで運ぶメモのパスの種類（ほかのドラッグと見分ける） */
export const MEMO_DRAG_TYPE = "application/x-kickoff-memo";

/** ドラッグで運んでいるメモか */
export const isMemoDrag = (e: DragEvent) => e.dataTransfer.types.includes(MEMO_DRAG_TYPE);

interface Props {
  nodes: TreeNode[];
  open: Set<string>;
  onToggle: (path: string) => void;
  selected?: string;
  onSelect: (path: string) => void;
  /** 行の右クリック（行のメニュー） */
  onMenu: (e: MouseEvent, node: TreeNode) => void;
  /** メモ・フォルダを、フォルダ（"" は直下）へ落とした */
  onDropInto: (path: string, folder: string) => void;
  depth?: number;
}

/**
 * メモのフォルダの木（エディタの木と同じ見た目。開いているフォルダの中だけ描く）。行をドラッグしてフォルダへ落とすと動かす
 * （ファイルの行に落とすと、そのファイルのあるフォルダへ）。右クリックで行のメニュー
 */
export function MemoTree(props: Props) {
  const { nodes, open, onToggle, selected, onSelect, onMenu, onDropInto, depth = 0 } = props;
  // ドラッグを重ねているフォルダ（落とす先を色で示す）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const folderOfNode = (node: TreeNode) => (node.dir ? node.path : parentOf(node.path));

  return (
    <ul className="file-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const isOpen = node.dir && open.has(node.path);
        return (
          <li key={node.path} role="treeitem" aria-expanded={node.dir ? isOpen : undefined} aria-selected={selected === node.path} className="tree-item">
            <button
              className={cx("tree-row", selected === node.path && "selected", node.dir && dropTarget === node.path && "drop-target")}
              style={{ "--depth": depth } as CSSProperties}
              title={node.path}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MEMO_DRAG_TYPE, node.path);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!isMemoDrag(e)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(folderOfNode(node));
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                const path = e.dataTransfer.getData(MEMO_DRAG_TYPE);
                setDropTarget(null);
                if (!path) return;
                e.preventDefault();
                e.stopPropagation();
                onDropInto(path, folderOfNode(node));
              }}
              onClick={() => (node.dir ? onToggle(node.path) : onSelect(node.path))}
              onContextMenu={(e) => {
                e.stopPropagation();
                onMenu(e, node);
              }}
            >
              <span className="tree-chevron">{node.dir && <Chevron open={isOpen} />}</span>
              <FileIcon name={node.name} dir={node.dir} open={isOpen} />
              <span className="tree-name">{node.name}</span>
            </button>
            {isOpen && node.children.length > 0 && <MemoTree {...props} nodes={node.children} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
