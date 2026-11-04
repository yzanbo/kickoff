import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";

/**
 * グループの「…」メニュー（名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・グループのボード）で 1 つ使う
 */
export function useGroupMenu({ onRename, onDelete }: { onRename: (group: ChatGroup) => void; onDelete: (group: ChatGroup) => void }) {
  const [open, setOpen] = useState<{ group: ChatGroup; x: number; y: number } | null>(null);

  const openFor = (group: ChatGroup, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen({ group, ...clampToViewport(e.clientX, e.clientY, 200, 110) });
  };

  /** 見出しに置く「…」ボタン */
  const button = (group: ChatGroup) => (
    <IconButton
      icon={MoreHorizontal}
      label={`${group.name} のメニュー`}
      title="メニュー（名前を変更・削除）"
      className="group-menu-button"
      aria-haspopup="menu"
      aria-expanded={open?.group.id === group.id}
      onClick={(e) => (open?.group.id === group.id ? setOpen(null) : openFor(group, e))}
    />
  );

  const menu = open && (
    <PopupMenu x={open.x} y={open.y} ignore=".group-menu-button" onClose={() => setOpen(null)}>
      <MenuItem onSelect={() => onRename(open.group)}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      <MenuItem danger onSelect={() => onDelete(open.group)}>
        <Trash2 size={14} /> グループを削除
      </MenuItem>
    </PopupMenu>
  );

  return { button, menu, openFor };
}
