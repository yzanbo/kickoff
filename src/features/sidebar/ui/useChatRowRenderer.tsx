import type { ComponentProps } from "react";
import type { Chat } from "@shared/chat/types";
import { alert } from "@/foundation/ui/kit/ask";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { useRoute } from "@/foundation/ui/navigation/router";
import { openChat, useChatRename, useChatStates } from "@/features/chat/ui";
import { useVisibleChildChats } from "@/features/chatPanel/ui";
import { ChatMenu } from "@/features/chatList/ui";
import { ChatRow } from "./ChatRow";

/** 行ごとに変える ChatRow の props（札・子チャットの開閉・並べ替え・プロジェクトの印） */
type RowExtras = Pick<ComponentProps<typeof ChatRow>, "after" | "reorder" | "hideChip" | "childMark" | "project">;

/**
 * サイドバーのチャットの行の配線（プロジェクトの一覧と要対応で共通）: 開いている行（URL と、右の欄で見えている子チャット）・状態・
 * 右クリックと「…」のメニュー（ChatMenu）・名前をその場で変える。子チャットは設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * menuElement は一覧の要素の中に描く
 */
export function useChatRowRenderer() {
  const route = useRoute();
  // 右の欄で見えている子チャットも、開いている行にする（タブと同じく、どれを開いているか分かるように）
  const shownChildren = useVisibleChildChats();
  const { stateOf } = useChatStates();
  const rowMenu = useContextMenu<Chat>();
  const rename = useChatRename((m) => void alert("名前を変更できませんでした", m));
  const renderRow = (chat: Chat, extras: RowExtras = {}) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      state={stateOf(chat)}
      active={(route.name === "chat" && route.chatId === chat.id) || shownChildren.has(chat.id)}
      menuOpen={rowMenu.menu?.value.id === chat.id}
      onMenu={(at) => rowMenu.openAt(at, chat)}
      onCloseMenu={rowMenu.close}
      onRename={() => rename.start(chat)}
      rename={rename.editorFor(chat)}
      onOpen={chat.parent_chat_id !== null ? () => openChat(chat) : undefined}
      {...extras}
    />
  );
  const menuElement = rowMenu.menu && (
    <ChatMenu
      at={rowMenu.menu.at}
      chat={rowMenu.menu.value}
      onOpenPanel={(chat) => openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id })}
      onRename={rename.start}
      onClose={rowMenu.close}
      onError={(m) => void alert("操作できませんでした", m)}
      ignore=".chat-row-more"
    />
  );
  return { renderRow, menuElement };
}
