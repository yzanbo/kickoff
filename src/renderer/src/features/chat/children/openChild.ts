// 子チャット・メモを、設定の開き方（右の欄 / 別ウィンドウ）で開く。右の欄は、いちばん上の親のチャットの画面の右の欄（孫・ひ孫も同じ欄に並べる）。
// 子チャットから親へ（聞いた位置を見る・答えを入力欄に入れる）もここ。別ウィンドウからは、メインのウィンドウに知らせてここを呼ぶ（App）
import type { Chat } from "@shared/types";
import { canPopout, openPopout, parsePopout } from "@/app/popout";
import { openChat } from "@/app/router";
import { postToMainWindow } from "@/app/windowBus";
import { CHILD_CHAT_OPEN_IN, chatDraft } from "@/lib/storageKeys";
import { readSetting, writeSetting } from "@/lib/storage";
import { knownChat } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { chatPaneOf, isChatPaneShown } from "@/features/chat/pane/windowMessages";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { rootChatOf } from "./childChats";

/** 別ウィンドウの中か（右の欄はメインのウィンドウにだけあるので、メインに知らせて開く） */
const inPopout = () => parsePopout(location.hash) !== undefined;

/** そのチャットのいちばん上の親を、メインのウィンドウで見せる（見えていなければチャットのパネルで開く）。親が分からなければ undefined */
function showRoot(chatId: number): Chat | undefined {
  const chat = knownChat(chatId);
  if (!chat) return undefined;
  const root = rootChatOf(chat, knownChat);
  if (root.parent_chat_id !== null) return undefined;
  if (!isChatPaneShown(root.id)) openChat(root.project_id, root.id);
  return root;
}

/**
 * いちばん上の親のチャットの画面の右の欄で開く（open に、いちばん上の親の ID と右の欄の操作を渡す）。
 * 親が分からない・右の欄を置けないときは false（呼んだ側が別の開き方にする）
 */
export function openInRootSide(chatId: number, open: (rootId: number, side: ReturnType<typeof panelActions>) => void): boolean {
  const root = showRoot(chatId);
  if (!root) return false;
  open(root.id, panelActions(panelKey("agents", root.id)));
  return true;
}

/** 子チャットを右の欄で開く（いちばん上の親の右の欄のタブ。親が分からなければ、ふつうのチャットと同じくチャットのパネルで） */
export function openChildSide(chat: Pick<Chat, "id" | "project_id" | "title">) {
  const opened = openInRootSide(chat.id, (rootId, side) => side.openChild({ chatId: rootId, childId: chat.id, projectId: chat.project_id, title: chat.title }));
  if (!opened) openChat(chat.project_id, chat.id);
}

/**
 * 子チャットを、設定の開き方（CHILD_CHAT_OPEN_IN）で開く: 右の欄 = いちばん上の親の右の欄のタブ / 別ウィンドウ（もう開いていれば前に出す）。
 * 別ウィンドウを開けない（スマホのブラウザ）なら右の欄。別ウィンドウの中から右の欄に開くときは、メインのウィンドウに頼む
 */
export function openChildChat(chat: Pick<Chat, "id" | "project_id" | "title">) {
  if (readSetting(CHILD_CHAT_OPEN_IN) === "window" && canPopout()) return openPopout({ kind: "chat", chatId: chat.id }, `${chatTitle(chat.title)} — 子チャット`);
  if (inPopout()) return postToMainWindow({ type: "openChild", chatId: chat.id });
  openChildSide(chat);
}

/** そのチャットの画面を見せる（子チャットなら右の欄のタブ、いちばん上のチャットならチャットのパネル） */
function showChatView(chat: Chat) {
  if (chat.parent_chat_id !== null) openChildSide(chat);
  else if (!isChatPaneShown(chat.id)) openChat(chat.project_id, chat.id);
}

/** 子チャットの親の、聞いた発言を見せる（メインのウィンドウで。別ウィンドウからはメインに頼む） */
export function revealInParent(child: Pick<Chat, "id" | "parent_chat_id" | "parent_event_id">) {
  if (child.parent_chat_id === null) return;
  if (inPopout()) return postToMainWindow({ type: "childToParent", childId: child.id, action: "reveal" });
  const parent = knownChat(child.parent_chat_id);
  if (!parent) return;
  showChatView(parent);
  const eventId = child.parent_event_id ?? undefined;
  // 開いたばかりの画面が描かれてから移る
  requestAnimationFrame(() => chatPaneOf(parent.id)?.revealInConversation(eventId, null));
}

/** 子チャットの答え（handBackText で作った文）を、親の入力欄の後ろに足す（送るのは自分で。別ウィンドウからはメインに頼む） */
export function handBackToParent(child: Pick<Chat, "id" | "parent_chat_id">, text: string) {
  if (child.parent_chat_id === null) return;
  if (inPopout()) return postToMainWindow({ type: "childToParent", childId: child.id, action: "handBack", text });
  const parent = knownChat(child.parent_chat_id);
  if (!parent) return;
  const pane = chatPaneOf(parent.id);
  if (pane) pane.fillComposer(text, { append: true });
  // 親の画面がまだなければ、書きかけの文に足しておく（開いたときに入力欄に入る）
  else writeSetting(chatDraft(parent.id), `${readSetting(chatDraft(parent.id))}${text}`);
  showChatView(parent);
}
