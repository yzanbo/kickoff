import { AppWindow, Columns2, PanelRight, Rows2 } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import { canPopout } from "@/foundation/ui/navigation/popout";
import type { Placement } from "@/foundation/ui/lib/floating";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { CHILD_CHAT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { openChatSplit } from "@/features/chatPanel/ui/board/openChatSplit";
import { openChat } from "@/features/chat/ui";
import { ChatMenuItems } from "./ChatMenuItems";

/**
 * チャットの右クリックメニュー（ボードのカード・サイドバー）。項目はパネルのタブと共通の ChatMenuItems で、タブの右クリックの「右に分ける」「下に分ける」と同じく
 * 「右に分けて開く」「下に分けて開く」も置く（そのプロジェクトのチャットのパネルで分ける。子チャット・ノートのチャットはパネルのタブにしないので出さない）。
 * 子チャット（サイドバーの親の中の行・要対応の一覧）は、「開く」を行を押したときと同じ設定の開き方（右の欄 / 別ウィンドウ）にし、分けて開くの代わりに
 * もう一方の開き方（「別ウィンドウで開く」/「右の欄で開く」）を置く（右の欄の子チャットのタブの右クリックと同じ項目）
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
  const child = chat.parent_chat_id !== null;
  return (
    <PopupMenu at={at} escape="pass" ignore={ignore} onClose={onClose}>
      <ChatMenuItems
        chat={chat}
        onOpen={child ? (c) => openChat(c) : onOpenPanel}
        onRename={onRename}
        onClose={onClose}
        onError={onError}
        before={
          child ? (
            <ChildOpenElsewhere chat={chat} />
          ) : (
            chat.note_path === null && (
            <>
              <MenuItem onSelect={() => openChatSplit(chat, "row")}>
                <Columns2 size={14} /> 右に分けて開く
              </MenuItem>
              <MenuItem onSelect={() => openChatSplit(chat, "column")}>
                <Rows2 size={14} /> 下に分けて開く
              </MenuItem>
            </>
            )
          )
        }
      />
    </PopupMenu>
  );
}

/** 子チャットを、設定の開き方（「開く」）でないもう一方で開く項目。別ウィンドウを開けない（スマホのブラウザ）なら出さない */
function ChildOpenElsewhere({ chat }: { chat: Chat }) {
  // 描く中で読む設定は購読して読む（readSetting だと React Compiler が覚えた結果を使い、設定を変えても読み直さない）
  const [openIn] = useSetting(CHILD_CHAT_OPEN_IN);
  if (!canPopout()) return null;
  return openIn === "window" ? (
    <MenuItem onSelect={() => openChat(chat, "side")}>
      <PanelRight size={14} /> 右の欄で開く
    </MenuItem>
  ) : (
    <MenuItem onSelect={() => openChat(chat, "window")}>
      <AppWindow size={14} /> 別ウィンドウで開く
    </MenuItem>
  );
}
