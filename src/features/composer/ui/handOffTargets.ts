// 「AI に渡す」の渡し先のうち、入力欄に足すもの（attachments の handOffTargets に contributes.ts で登録する）:
// このチャット（右の欄・別ウィンドウの足す先のチャット）に追加 / 中のチャット（右の欄の中の子チャット・ノートのチャット）に追加 / それぞれにパスを追加 / ほかのチャットに追加（画面は移さない）
import type { Chat } from "@shared/chat/types";
import { captureOf, linkChat, type HandOffItem, type HandOffTarget } from "@/features/attachments/ui";
import { chatTargetName, chatTitle, screenOfChat } from "@/features/chat/ui";
import { showToast } from "@/foundation/ui/kit/toast";
import { appendToDraft } from "./appendToDraft";

/** 一言と札を、そのチャットの入力欄に足す */
async function appendItem(item: HandOffItem, chat: Chat | null) {
  if (!chat) return;
  const attachments = await captureOf(item);
  if (!attachments) return;
  appendToDraft(chat.id, item.text, attachments);
  linkChat(item, chat);
}

/** ファイルのフルパスを、そのチャットの入力欄に足す */
async function appendPath(item: HandOffItem, chat: Chat | null) {
  if (chat && item.path) appendToDraft(chat.id, item.path);
}

const textTitle = (item: HandOffItem, chat: Chat | null) => `${item.what}を「${chatTitle(chat?.title)}」の入力欄に足す`;
const pathTitle = (_item: HandOffItem, chat: Chat | null) => `ファイルのフルパスを「${chatTitle(chat?.title)}」の入力欄に足す`;

export const thisChatHandOff: HandOffTarget = { id: "this", order: 20, label: ({ mainChat }) => (mainChat ? "このチャットに追加" : null), title: textTitle, run: appendItem };

export const thisChatPathHandOff: HandOffTarget = {
  id: "thisPath",
  order: 22,
  hands: "path",
  label: ({ mainChat }) => (mainChat ? "パスをこのチャットに追加" : null),
  title: pathTitle,
  run: appendPath,
};

/** 右の欄の中の子チャット・ノートのチャットの中なら、そのチャット（呼び名は addTargetsOf） */
export const innerChatHandOff: HandOffTarget = {
  id: "inner",
  order: 24,
  label: ({ inner }) => (inner ? `${inner.name}に追加` : null),
  chatOf: ({ inner }) => inner?.chat ?? null,
  title: textTitle,
  run: appendItem,
};

export const innerChatPathHandOff: HandOffTarget = {
  id: "innerPath",
  order: 26,
  hands: "path",
  label: ({ inner }) => (inner ? `パスを${inner.name}に追加` : null),
  chatOf: ({ inner }) => inner?.chat ?? null,
  title: pathTitle,
  run: appendPath,
};

/** 開いていなければ書きかけの文と添付に足し、「〇〇に追加しました［開く］」と知らせる（知らせは appendToDraft が出す） */
export const otherChatHandOff: HandOffTarget = {
  id: "other",
  order: 40,
  label: ({ mainChat }) => (mainChat === null ? "チャットに追加" : "ほかのチャットに追加"),
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
