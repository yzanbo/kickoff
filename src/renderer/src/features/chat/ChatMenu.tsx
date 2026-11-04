import type { Chat } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { PopupMenu } from "@/ui/PopupMenu";
import { ChatMenuItems } from "./ChatMenuItems";

/** チャットの右クリックメニュー（カンバンのカード・グループのボード・サイドバー）。項目はパネルのタブと共通の ChatMenuItems */
export function ChatMenu({
  at,
  chat,
  onOpenPanel,
  onRename,
  onClose,
  onError,
  ignore,
}: {
  /** 置く場所（右クリックの位置、または「…」の右端にそろえてその下） */
  at: Placement;
  chat: Chat;
  onOpenPanel: (chat: Chat) => void;
  /** 名前をその場で変え始める（カード・行の名前を入力欄にする） */
  onRename: (chat: Chat) => void;
  onClose: () => void;
  onError: (message: string) => void;
  /** 押しても外側のクリックとして閉じない要素（メニューを開くボタン。開閉はそちらで行う） */
  ignore?: string;
}) {
  return (
    <PopupMenu at={at} escape="pass" ignore={ignore} onClose={onClose}>
      <ChatMenuItems chat={chat} onOpen={onOpenPanel} onRename={onRename} onClose={onClose} onError={onError} />
    </PopupMenu>
  );
}
