import { useEffect } from "react";
import { subscribeWindowMessages, type WindowMessage } from "@/app/windowBus";
import type { ChatPaneActions } from "./chatPaneContext";

/** メインのウィンドウで描いているチャットの画面（チャットごと。同じチャットを 2 つの欄で開いていることもある） */
const panes = new Map<number, Set<ChatPaneActions>>();
let unsubscribe: (() => void) | undefined;

/** 見えている画面を先に（同じチャットを 2 つの欄で開いていても、知らせを 1 回だけ当てる） */
function paneFor(chatId: number): ChatPaneActions | undefined {
  const list = [...(panes.get(chatId) ?? [])];
  return list.find((p) => p.root.current?.isConnected && p.root.current.offsetParent !== null) ?? list[0];
}

function handle(message: WindowMessage) {
  if (message.type === "openProjectFile" || message.type === "popoutFocus" || message.type === "openMemo") return;
  const pane = paneFor(message.chatId);
  if (!pane) return;
  if (message.type === "fillComposer") pane.fillComposer(message.text, { append: true });
  else if (message.type === "reveal") pane.revealInConversation(message.eventId, message.agent);
  else pane.show("activity", { kind: "agent", key: message.agent });
}

/**
 * 別ウィンドウ（変更・サブエージェント）からの、このチャットへの知らせを受け取る（メインのウィンドウの ChatView だけが呼ぶ）:
 * チャット欄に足す（差分の行・返答へのコメント）・会話のその場所へ移る・動きを開く
 */
export function useWindowMessagesFor(pane: ChatPaneActions) {
  useEffect(() => {
    let set = panes.get(pane.chatId);
    if (!set) panes.set(pane.chatId, (set = new Set()));
    set.add(pane);
    unsubscribe ??= subscribeWindowMessages(handle);
    return () => {
      set.delete(pane);
      if (set.size === 0) panes.delete(pane.chatId);
    };
  }, [pane]);
}
