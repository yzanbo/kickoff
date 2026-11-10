import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { NewChatItem } from "@/features/chat/NewChatItem";

/**
 * グループの「…」メニュー（新しいチャット・名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・全プロジェクトのボードのグループの列）で 1 つ使う。
 * onNewChat があれば、いちばん上に「新しいチャット」（そのグループに作る。見出しの鉛筆と同じ）を区切り線で分けて置く。
 * チャットの右クリックと同じく、どこで始めるか（グループの札と作業場所の札「本体」）を項目の右に添える（NewChatItem。利用者の依頼）。
 * extra は区切り線の下に足す項目（サイドバーの「まとまりを色付きで表示」）
 */
export function useGroupMenu({
  onNewChat,
  onRename,
  onDelete,
  extra,
}: {
  onNewChat?: (group: ChatGroup) => void;
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
      title={onNewChat ? "メニュー（新しいチャット・名前を変更・削除）" : "メニュー（名前を変更・削除）"}
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
      {onNewChat && (
        <>
          <NewChatItem place={{ projectId: open.value.project_id, group: open.value.id }} sameAs="" onSelect={() => onNewChat(open.value)} />
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
