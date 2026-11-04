import type { Chat } from "@shared/types";
import { api } from "@/api";
import { chatTitle } from "./chatTitle";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { writeSetting } from "@/lib/storage";
import { chatDraft } from "@/lib/storageKeys";

/**
 * 確かめてから、チャットをアーカイブする（アーカイブ済みなら戻す。どちらも確かめる。やめたら false）。
 * アーカイブ・戻すはどこから押しても必ず確かめる（確かめずにアーカイブする操作は置かない）
 */
export async function toggleArchiveChat(chat: Pick<Chat, "id" | "title" | "archived_at">): Promise<boolean> {
  const name = chatTitle(chat.title);
  const ok = await confirmDialog(
    chat.archived_at
      ? { title: `チャット「${name}」をアーカイブから戻しますか？`, message: "一覧に、また出るようになります。", confirmLabel: "戻す" }
      : {
          title: `チャット「${name}」をアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残ります。サイドバーの「チャット」の行の「アーカイブ」を「表示」にすると出せ、右クリックのメニューから戻せます。",
          confirmLabel: "アーカイブ",
        },
  );
  if (ok) await api.archiveChat(chat.id, !chat.archived_at);
  return ok;
}

/** チャットをサイドバーのプロジェクトの上に固定する（固定していればやめる） */
export const togglePinChat = (chat: Pick<Chat, "id" | "pinned">) => api.pinChat(chat.id, !chat.pinned);

/** チャットを削除する（消したチャットの入力欄の書きかけの文も残さない） */
export async function deleteChat(chatId: number) {
  await api.deleteChat(chatId);
  writeSetting(chatDraft(chatId), "");
}

/** 確かめてから、チャットを削除する（やめたら false） */
export async function confirmDeleteChat(chat: Pick<Chat, "id" | "title">): Promise<boolean> {
  const ok = await confirmDialog({
    title: `チャット「${chatTitle(chat.title)}」を削除しますか？`,
    message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。",
    confirmLabel: "削除",
    danger: true,
  });
  if (ok) await deleteChat(chat.id);
  return ok;
}

/** チャットをまとめて操作する（1 件ずつ送り、断られたもの（作業中など）は最後にまとめて知らせる） */
async function eachChat(chats: Chat[], action: string, fn: (chat: Chat) => Promise<unknown>) {
  const failures: string[] = [];
  for (const chat of chats) {
    try {
      await fn(chat);
    } catch (e) {
      failures.push(`「${chatTitle(chat.title)}」: ${errorMessage(e)}`);
    }
  }
  if (failures.length > 0) await alertDialog(`${failures.length} 件は${action}できませんでした`, failures.slice(0, 5).join("\n"));
}

/** 確かめてから、まとめてアーカイブする（どれもアーカイブ済みなら、まとめて戻す。やめたら false） */
export async function confirmArchiveChats(chats: Chat[]): Promise<boolean> {
  const restore = chats.every((r) => r.archived_at);
  const targets = restore ? chats : chats.filter((r) => !r.archived_at);
  const ok = await confirmDialog(
    restore
      ? { title: `${targets.length} 件のチャットをアーカイブから戻しますか？`, message: "一覧に、また出るようになります。", confirmLabel: "戻す" }
      : {
          title: `${targets.length} 件のチャットをアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残ります。作業中のチャットはアーカイブできません。",
          confirmLabel: "アーカイブ",
        },
  );
  if (ok) await eachChat(targets, restore ? "戻す" : "アーカイブ", (r) => api.archiveChat(r.id, !restore));
  return ok;
}

/** 確かめてから、まとめて削除する（やめたら false） */
export async function confirmDeleteChats(chats: Chat[]): Promise<boolean> {
  const ok = await confirmDialog({
    title: `${chats.length} 件のチャットを削除しますか？`,
    message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。作業中のチャットは削除できません。",
    confirmLabel: "削除",
    danger: true,
  });
  if (ok) await eachChat(chats, "削除", (r) => deleteChat(r.id));
  return ok;
}

/** まとめて既読にする（未読の印を消す。印のないものはそのまま） */
export const markChatsSeen = (chats: Chat[]) => eachChat(chats.filter((r) => r.unread), "既読に", (r) => api.markSeen(r.id));

/** まとめてグループへ移す（null はグループなし。同じプロジェクトのチャットだけ） */
export const moveChatsToGroup = (chats: Chat[], groupId: number | null) => eachChat(chats, "移動", (r) => api.setChatGroup(r.id, groupId));

