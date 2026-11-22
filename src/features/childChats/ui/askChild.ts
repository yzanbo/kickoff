// 子チャットから親へ（聞いた位置を見る・答えを入力欄に入れる）。新しい子チャットで聞く openAskChild は chat の openChat.ts（下の attachments も読むため）。
// 別ウィンドウからは、メインのウィンドウに知らせてここを呼ぶ（./appHosts.ts）
import type { HandoffFrom } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import { parsePopout } from "@/foundation/ui/navigation/popout";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { storage } from "./storage";
import { writeSetting } from "@/foundation/ui/storage";
import { isScreenShown, knownChat, openChat, screenOfChat } from "@/features/chat/ui";
import { appendToDraft } from "@/features/composer/ui";

/** 別ウィンドウの中か（右の欄はメインのウィンドウにだけあるので、メインに知らせて開く） */
const inPopout = () => parsePopout(location.hash) !== undefined;

/** そのチャットの画面を見せる（子チャットなら右の欄のタブ、いちばん上のチャットならチャットのパネル） */
function showChatView(chat: Chat) {
  if (chat.parent_chat_id !== null) openChat(chat, "side");
  else if (!isScreenShown(chat.id)) openChat(chat, "tab");
}

/** 子チャットの親の、聞いた発言を見せる（メインのウィンドウで。別ウィンドウからはメインに頼む） */
export function revealInParent(child: Pick<Chat, "id" | "parent_chat_id" | "parent_event_id">) {
  if (child.parent_chat_id === null) return;
  if (inPopout()) return postToMainWindow("childToParent", { childId: child.id, action: "reveal" });
  const parent = knownChat(child.parent_chat_id);
  if (!parent) return;
  showChatView(parent);
  const eventId = child.parent_event_id ?? undefined;
  // 開いたばかりの画面が描かれてから移る
  requestAnimationFrame(() => screenOfChat(parent.id)?.activity.revealInConversation(eventId, null));
}

/**
 * 子チャットの答え（handBackText で作った引用・依頼文）を、親の入力欄の後ろに空行を挟んで足す（送るのは自分で。別ウィンドウからはメインに頼む）。
 * from を渡すと、親の入力欄の上に出どころの札（「子チャット『…』から」）を出し、送った発言に付ける（handBackFrom。保存はウィンドウで共有）
 */
export function handBackToParent(child: Pick<Chat, "id" | "parent_chat_id">, text: string, from?: HandoffFrom) {
  if (child.parent_chat_id === null) return;
  if (from) writeSetting(storage.settings.handBackFrom(child.parent_chat_id), from);
  if (inPopout()) return postToMainWindow("childToParent", { childId: child.id, action: "handBack", text });
  const parent = knownChat(child.parent_chat_id);
  if (!parent) return;
  // 親の画面がまだなければ、書きかけの文に足しておく（開いたときに入力欄に入る。知らせは出さない）
  appendToDraft(parent.id, text, [], { notify: false });
  showChatView(parent);
}
