import type { MouseEvent } from "react";
import type { MemoEntry } from "@shared/types";
import { cx } from "@/lib/cx";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { baseName, parentOf } from "./memoPaths";

interface Props {
  found: readonly MemoEntry[];
  isSelected: (path: string) => boolean;
  /** 行を押した（修飾キーを見て、選ぶか開くかは一覧（MemoTab）が決める） */
  onRowClick: (path: string, e: MouseEvent) => void;
  onMenu: (e: MouseEvent, node: TreeNode) => void;
}

/** メモのタブで名前で探したときの、合うメモの平らな一覧（新しく変えた順。名前の右に入っているフォルダ）。木と同じく ⌘ / Shift ＋クリックでいくつも選べる */
export function MemoFoundList({ found, isSelected, onRowClick, onMenu }: Props) {
  return (
    <ul className="memo-found" role="listbox" aria-label="見つかったメモ">
      {found.map((e) => (
        <li key={e.path}>
          <button
            role="option"
            aria-selected={isSelected(e.path)}
            className={cx("tree-row", isSelected(e.path) && "selected")}
            onClick={(ev) => onRowClick(e.path, ev)}
            onContextMenu={(ev) => onMenu(ev, { name: baseName(e.path), path: e.path, dir: false, ignored: false, children: [] })}
          >
            <FileIcon name={baseName(e.path)} dir={false} />
            <span className="tree-name">{baseName(e.path)}</span>
            {parentOf(e.path) && <span className="memo-found-folder">{parentOf(e.path)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
