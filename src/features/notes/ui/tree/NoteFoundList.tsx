import "./NoteFoundList.css";
import type { MouseEvent } from "react";
import { baseName } from "@shared/foundation/path";
import type { NoteEntry } from "@shared/notes/types";
import { cx } from "@/foundation/ui/lib/cx";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import { parentOf } from "@/features/notes/ui/notePaths";

interface Props {
  found: readonly NoteEntry[];
  isSelected: (path: string) => boolean;
  /** 行を押した（修飾キーを見て、選ぶか開くかは一覧（NoteTab）が決める） */
  onRowClick: (path: string, e: MouseEvent) => void;
  onMenu: (e: MouseEvent, node: TreeNode) => void;
}

/** ノートのタブで名前で探したときの、合うノートの平らな一覧（新しく変えた順。名前の右に入っているフォルダ）。木と同じく ⌘ / Shift ＋クリックでいくつも選べる */
export function NoteFoundList({ found, isSelected, onRowClick, onMenu }: Props) {
  return (
    <ul className="note-found" role="listbox" aria-label="見つかったノート">
      {found.map((e) => (
        <li key={e.path}>
          <button
            role="option"
            aria-selected={isSelected(e.path)}
            className={cx("list-item tree-row tree-indent", isSelected(e.path) && "selected")}
            onClick={(ev) => onRowClick(e.path, ev)}
            onContextMenu={(ev) => onMenu(ev, { name: baseName(e.path), path: e.path, dir: false, ignored: false, children: [] })}
          >
            <FileIcon name={baseName(e.path)} dir={false} />
            <span className="tree-name">{baseName(e.path)}</span>
            {parentOf(e.path) && <span className="note-found-folder">{parentOf(e.path)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
