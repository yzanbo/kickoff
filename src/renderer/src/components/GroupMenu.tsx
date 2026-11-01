import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { RunGroup } from "../../../core/types";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/**
 * グループの「…」メニュー（名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・グループのボード）で 1 つ使う
 */
export function useGroupMenu({ onRename, onDelete }: { onRename: (group: RunGroup) => void; onDelete: (group: RunGroup) => void }) {
  const [open, setOpen] = useState<{ group: RunGroup; x: number; y: number } | null>(null);

  const openFor = (group: RunGroup, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen({ group, ...clampToViewport(e.clientX, e.clientY, 200, 110) });
  };

  /** 見出しに置く「…」ボタン */
  const button = (group: RunGroup) => (
    <button
      className="icon-button group-menu-button"
      title="メニュー（名前を変更・削除）"
      aria-label={`${group.name} のメニュー`}
      aria-haspopup="menu"
      onClick={(e) => openFor(group, e)}
    >
      <MoreHorizontal size={14} />
    </button>
  );

  const menu = open && (
    <PopupMenu x={open.x} y={open.y} onClose={() => setOpen(null)}>
      <button role="menuitem" onClick={() => (setOpen(null), onRename(open.group))}>
        <Pencil size={14} /> 名前を変更
      </button>
      <button role="menuitem" className="danger" onClick={() => (setOpen(null), onDelete(open.group))}>
        <Trash2 size={14} /> グループを削除
      </button>
    </PopupMenu>
  );

  return { button, menu, openFor };
}
