// 「AI に渡す」の渡し先のうち、入力欄に足すもの 2 つ（attachments の handOffTargets に contributes.ts で登録する）:
// このチャット（右の欄・別ウィンドウの足す先のチャット）に追加 / ほかのチャットに追加（画面は移さない）
import { captureOf, linkChat, type HandOffTarget } from "@/features/attachments/ui";
import { chatTargetName, chatTitle, screenOfChat } from "@/features/chat/ui";
import { showToast } from "@/foundation/ui/kit/toast";
import { appendToDraft } from "./appendToDraft";

export const thisChatHandOff: HandOffTarget = {
  id: "this",
  order: 20,
  label: (mainChat) => (mainChat ? "このチャットに追加" : null),
  title: (item, chat) => `${item.what}を「${chatTitle(chat?.title)}」の入力欄に足す`,
  async run(item, chat) {
    if (!chat) return;
    const attachments = await captureOf(item);
    if (!attachments) return;
    appendToDraft(chat.id, item.text, attachments);
    linkChat(item, chat);
  },
};

/** 開いていなければ書きかけの文と添付に足し、「〇〇に追加しました［開く］」と知らせる（知らせは appendToDraft が出す） */
export const otherChatHandOff: HandOffTarget = {
  id: "other",
  order: 40,
  label: (mainChat) => (mainChat === null ? "チャットに追加" : "ほかのチャットに追加"),
  title: (item, chat) => `${item.what}を「${chatTitle(chat?.title)}」の入力欄に足す（画面は移らず、開いていなければ書きかけに足して知らせる）`,
  pickChat: true,
  async run(item, chat) {
    if (!chat) return;
    const attachments = await captureOf(item);
    if (!attachments) return;
    const open = screenOfChat(chat.id) !== undefined;
    appendToDraft(chat.id, item.text, attachments);
    // 画面があれば入力欄に入る（知らせは開いていないときに appendToDraft が出す）
    if (open) showToast(`${chatTargetName(chat)}に追加しました`);
    linkChat(item, chat);
  },
};
