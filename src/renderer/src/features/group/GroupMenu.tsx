import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * グループの「…」メニュー（名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・グループのボード）で 1 つ使う。
 * extra は区切り線の下に足す項目（サイドバーの「まとまりを色付きで表示」）
 */
export function useGroupMenu({ onRename, onDelete, extra }: { onRename: (group: ChatGroup) => void; onDelete: (group: ChatGroup) => void; extra?: ReactNode }) {
  // 「…」はボタンの右端にそろえて下に、右クリックは押した位置に開く
  const menuState = useContextMenu<ChatGroup>({ align: "end" });
  const open = menuState.menu;

  const openFor = (group: ChatGroup, e: MouseEvent) => {
    e.stopPropagation();
    menuState.open(e, group);
  };

  /** 見出しに置く「…」ボタン */
  const button = (group: ChatGroup) => (
    <IconButton
      icon={Ellipsis}
      label={`${group.name} のメニュー`}
      title="メニュー（名前を変更・削除）"
      className="group-menu-button"
      aria-haspopup="menu"
      aria-expanded={open?.value.id === group.id}
      onClick={(e) => {
        // 見出しを押したとき（グループのボードを開く・開閉）に伝えない
        e.stopPropagation();
        if (open?.value.id === group.id) menuState.close();
        else menuState.openBelow(e, group);
      }}
    />
  );

  const menu = open && (
    <PopupMenu at={open.at} ignore=".group-menu-button" onClose={menuState.close}>
      <MenuItem onSelect={() => onRename(open.value)}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      <MenuItem danger onSelect={() => onDelete(open.value)}>
        <Trash2 size={14} /> グループを削除
      </MenuItem>
      {extra && (
        <>
          <div className="menu-separator" role="separator" />
          {extra}
        </>
      )}
    </PopupMenu>
  );

  return { button, menu, openFor };
}
