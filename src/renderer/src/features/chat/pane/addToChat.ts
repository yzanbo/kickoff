// チャットの入力欄の後ろに文（と添付）を足す口（右の欄・別ウィンドウの「チャットに追加」・右クリックの「メインのチャット」・メモの添付・「AI に渡す」で共通）
import type { Attachment } from "@shared/types";
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { readSetting, writeSetting } from "@/lib/storage";
import { chatAttachmentsDraft, chatDraft } from "@/lib/storageKeys";
import { knownChat } from "@/stores/chats";
import { showToast } from "@/ui/toast";
import { chatTargetName } from "@/features/chat/chatTitle";
import { mergeAttachments } from "@/features/chat/attachments/attachmentMerge";
import { appendBlock } from "@/features/chat/messages/quoteComment";
import { openChatOrChild } from "@/features/chat/children/openChild";
import { chatPaneOf, setMissingFill } from "./windowMessages";

/**
 * そのチャットの入力欄の後ろに足す（送るのは自分で）。このウィンドウにそのチャットの画面があればそこへ（右の欄の子チャット・別ウィンドウの子チャットなど）、
 * なければ、別ウィンドウの中からはメインのウィンドウに頼む。メインのウィンドウで画面が開いていなければ、書きかけの文と送る前の添付に足して知らせる（画面は移さない）
 */
export function addToChat(chatId: number, text: string, attachments?: Attachment[]) {
  const pane = chatPaneOf(chatId);
  if (pane) return pane.fillComposer(text, { append: true, attachments });
  if (parsePopout(location.hash)) return postToMainWindow({ type: "fillComposer", chatId, text, attachments });
  addToChatDraft(chatId, text, attachments);
}

/**
 * 開いていないチャットの書きかけの文（chatDraft）と送る前の添付（chatAttachmentsDraft）に足し、「〇〇に追加しました［開く］」と知らせる。
 * 開いたときに入力欄に入る。同じメモ・同じ出どころの取ったものは新しく足した方に入れ替える
 */
export function addToChatDraft(chatId: number, text: string, attachments: Attachment[] = []) {
  if (text) writeSetting(chatDraft(chatId), appendBlock(readSetting(chatDraft(chatId)), text));
  if (attachments.length > 0) writeSetting(chatAttachmentsDraft(chatId), mergeAttachments(readSetting(chatAttachmentsDraft(chatId)), attachments));
  const chat = knownChat(chatId);
  showToast(`${chatTargetName(chat)}に追加しました`, chat ? { label: "開く", run: () => openChatOrChild(chat) } : undefined);
}

// 別ウィンドウから頼まれたのに、メインのウィンドウにも足す先の画面がないとき
setMissingFill(addToChatDraft);
