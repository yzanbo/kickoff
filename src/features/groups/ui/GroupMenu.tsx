import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import type { ChatGroup } from "@shared/groups/types";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/**
 * グループの「…」メニュー（新しいチャット・名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・全プロジェクトのボードのグループの列）で 1 つ使う。
 * lead があれば、いちばん上にその項目（呼ぶ側が渡す「新しいチャット」。そのグループに作る。見出しの鉛筆と同じ）を区切り線で分けて置く。
 * extra は区切り線の下に足す項目（サイドバーの「まとまりを色付きで表示」）
 */
export function useGroupMenu({
  lead,
  onRename,
  onDelete,
  extra,
}: {
  lead?: (group: ChatGroup) => ReactNode;
  onRename: (group: ChatGroup) => void;
  onDelete: (group: ChatGroup) => void;
  extra?: ReactNode;
}) {
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
      title={lead ? "メニュー（新しいチャット・名前を変更・削除）" : "メニュー（名前を変更・削除）"}
      className="group-menu-button"
      aria-haspopup="menu"
      aria-expanded={open?.value.id === group.id}
      onClick={(e) => {
        // 見出しを押したとき（開閉）に伝えない
        e.stopPropagation();
        if (open?.value.id === group.id) menuState.close();
        else menuState.openBelow(e, group);
      }}
    />
  );

  const menu = open && (
    <PopupMenu at={open.at} ignore=".group-menu-button" onClose={menuState.close}>
      {lead && (
        <>
          {lead(open.value)}
          <div className="menu-separator" role="separator" />
        </>
      )}
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
