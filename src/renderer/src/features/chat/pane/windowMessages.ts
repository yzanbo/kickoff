import { useEffect } from "react";
import type { Attachment } from "@shared/types";
import { subscribeWindowMessages, type WindowMessage } from "@/app/windowBus";
import type { ChatPaneActions } from "./chatPaneContext";

/** メインのウィンドウで描いているチャットの画面（チャットごと。同じチャットを 2 つの欄で開いていることもある） */
const panes = new Map<number, Set<ChatPaneActions>>();
/** 画面のあるタブを表に出す操作（パネルのタブの中の画面だけ。隠れたタブで「移る」を受けたときに使う） */
const fronts = new WeakMap<ChatPaneActions, () => void>();
let unsubscribe: (() => void) | undefined;
/** 足す先の画面がないときの受け口（addToChat.ts が置く。輪にならないよう、ここからは import しない） */
let onMissingFill: ((chatId: number, text: string, attachments?: Attachment[]) => void) | undefined;
export const setMissingFill = (fn: typeof onMissingFill) => {
  onMissingFill = fn;
};

/** 見えている画面を先に（同じチャットを 2 つの欄で開いていても、知らせを 1 回だけ当てる） */
function paneFor(chatId: number): ChatPaneActions | undefined {
  const list = [...(panes.get(chatId) ?? [])];
  return list.find((p) => p.root.current?.isConnected && p.root.current.offsetParent !== null) ?? list[0];
}

/** このウィンドウで描いているそのチャットの画面（見えているものを先に。なければ undefined） */
export const chatPaneOf = (chatId: number): ChatPaneActions | undefined => paneFor(chatId);

/** そのチャットの画面が、このウィンドウで見えているか */
export const isChatPaneShown = (chatId: number): boolean => {
  const el = paneFor(chatId)?.root.current;
  return Boolean(el?.isConnected && el.offsetParent !== null);
};

/** このウィンドウで見えているチャットの画面のチャットの ID（右の欄の子チャットも含む） */
export function shownChatIds(): number[] {
  return [...panes.keys()].filter((id) => isChatPaneShown(id));
}

function handle(message: WindowMessage) {
  if (message.type !== "fillComposer" && message.type !== "reveal" && message.type !== "showActivity") return;
  const pane = paneFor(message.chatId);
  // 別ウィンドウから足す先のチャットの画面がメインのウィンドウにもなければ、書きかけの文と添付に足して知らせる
  if (!pane) return message.type === "fillComposer" ? onMissingFill?.(message.chatId, message.text, message.attachments) : undefined;
  if (message.type === "fillComposer") return pane.fillComposer(message.text, { append: true, attachments: message.attachments });
  // 移る・動きを開くは、裏のタブ・閉じたパネルの画面なら先にそのタブを表に出す（隠れた画面の中で移っても、利用者には見えない）
  if (!isChatPaneShown(message.chatId)) fronts.get(pane)?.();
  if (message.type === "reveal") pane.revealInConversation(message.eventId, message.agent);
  else pane.focusActivity(message.agent);
}

/**
 * 別ウィンドウ（変更・サブエージェント）からの、このチャットへの知らせを受け取る（メインのウィンドウの ChatView だけが呼ぶ）:
 * チャット欄に足す（選択部分の「チャットに追加」・右クリックの「メインのチャット」・メモ）・会話のその場所へ移る・動きでそのサブエージェントを強調する。
 * front はその画面のあるタブを表に出す操作（パネルのタブの中だけ。移る・動きを開くときに、隠れていれば先に表に出す）
 */
export function useWindowMessagesFor(pane: ChatPaneActions, front: (() => void) | null) {
  useEffect(() => {
    if (front) fronts.set(pane, front);
    else fronts.delete(pane);
  }, [pane, front]);
  useEffect(() => {
    let set = panes.get(pane.chatId);
    if (!set) panes.set(pane.chatId, (set = new Set()));
    set.add(pane);
    if (!unsubscribe) unsubscribe = subscribeWindowMessages(handle);
    return () => {
      set.delete(pane);
      if (set.size === 0) panes.delete(pane.chatId);
    };
  }, [pane]);
}
