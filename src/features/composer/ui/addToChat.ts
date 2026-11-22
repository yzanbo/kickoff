// チャットの入力欄の後ろに文（と添付）を足す口（右の欄・別ウィンドウの「チャットに追加」・右クリックの「メインのチャット」・ノートの添付・「AI に渡す」・子チャットの答えで共通）。
// 下の attachments の「AI に渡す」も読むので、渡し先の登録（handOffTargets）にするまではこのファイルの名前のまま
import type { Attachment } from "@shared/chat/types";
import { onServerEvent } from "@/foundation/ui/api/events";
import { parsePopout } from "@/foundation/ui/navigation/popout";
import { onWindowMessage, postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { showToast } from "@/foundation/ui/kit/toast";
import { chatTargetName } from "@/features/chat/ui/chatTitle";
import { knownChat, openChat, screenOfChat } from "@/features/chat/ui";
import { appendDraft, chatComposerDraft, forgetChatDraft } from "./composerDraft";
import { focusComposer } from "./composerFields";

/**
 * そのチャットの下書きの後ろに足す（送るのは自分で）。このウィンドウにそのチャットの画面があれば、その入力欄にピントを移す（focus: false なら移さない）。
 * 画面がなければ、別ウィンドウの中からはメインのウィンドウに頼み、メインのウィンドウでは足したことを「〇〇に追加しました［開く］」と知らせる（画面は移さない。notify: false なら知らせない）
 */
export function appendToDraft(chatId: number, text: string, attachments: readonly Attachment[] = [], opts: { focus?: boolean; notify?: boolean } = {}) {
  const screen = screenOfChat(chatId);
  if (!screen && parsePopout(location.hash)) return postToMainWindow("appendToDraft", { chatId, text, attachments: [...attachments] });
  appendDraft(chatComposerDraft(chatId), text, attachments);
  if (screen) {
    if (opts.focus !== false) focusComposer(chatId, { end: true });
    return;
  }
  if (opts.notify === false) return;
  const chat = knownChat(chatId);
  showToast(`${chatTargetName(chat)}に追加しました`, chat ? { label: "開く", run: () => openChat(chat) } : undefined);
}

/** 別ウィンドウから頼まれた足し込みと、消したチャットの下書きの片付けを受け始める（起動したときに 1 回） */
export function startComposerDrafts() {
  onWindowMessage("appendToDraft", ({ chatId, text, attachments }) => appendToDraft(chatId, text, attachments));
  onServerEvent("chat_deleted", (e) => forgetChatDraft(e.id));
}
