import { Columns2, Rows2 } from "lucide-react";
import type { Chat } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { openChatSplit } from "@/features/panel/board/openChatSplit";
import { ChatMenuItems } from "./ChatMenuItems";

/**
 * チャットの右クリックメニュー（ボードのカード・サイドバー）。項目はパネルのタブと共通の ChatMenuItems で、タブの右クリックと同じく
 * 「右に分けて開く」「下に分けて開く」も置く（そのプロジェクトのチャットのパネルで分ける。子チャット・メモのチャットはパネルのタブにしないので出さない）
 */
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
      <ChatMenuItems
        chat={chat}
        onOpen={onOpenPanel}
        onRename={onRename}
        onClose={onClose}
        onError={onError}
        before={
          chat.parent_chat_id === null &&
          chat.memo_path === null && (
            <>
              <MenuItem onSelect={() => openChatSplit(chat, "row")}>
                <Columns2 size={14} /> 右に分けて開く
              </MenuItem>
              <MenuItem onSelect={() => openChatSplit(chat, "column")}>
                <Rows2 size={14} /> 下に分けて開く
              </MenuItem>
            </>
          )
        }
      />
    </PopupMenu>
  );
}
