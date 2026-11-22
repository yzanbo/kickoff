// DB クライアントの「AI に聞く」で、チャットに聞く（新しいチャットを作って送る / いまあるチャットに送る。別ウィンドウの中なら、開くのはメインのウィンドウ）
import type { Chat } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { parsePopout } from "@/foundation/ui/navigation/popout";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { open } from "@/foundation/ui/navigation/open";
import { addChat } from "@/features/chat/ui/store/knownChats";
import { showToast } from "@/foundation/ui/kit/toast";
import { chatTargetName } from "@/features/chat/ui/chatTitle";
import { openChat } from "@/features/chat/ui";

/** チャットを開く（別ウィンドウの中なら、メインのウィンドウに頼む） */
function openDbChat(chat: Pick<Chat, "id" | "project_id" | "title" | "parent_chat_id">) {
  if (parsePopout(location.hash) === undefined) return openChat(chat);
  if (chat.parent_chat_id !== null) postToMainWindow("openChild", { chatId: chat.id });
  else open({ kind: "chat", projectId: chat.project_id, chatId: chat.id }, { surface: "page" });
}

/** 新しいチャットに text を送って作り、そのチャットを開く */
export async function startDbChat(projectId: number, text: string, title: string): Promise<void> {
  const chat = await api.startChat(projectId, { text, title });
  addChat(chat);
  openDbChat(chat);
}

/**
 * いまあるチャットに text を送る（作業中なら送信待ちに入れる。「伝える」と同じ口）。画面は移さず、「〇〇に送りました［開く］」と知らせる
 */
export async function askDbInChat(chat: Chat, text: string): Promise<void> {
  const result = await api.queueMessage(chat.id, text, {});
  showToast(`${chatTargetName(chat)}${result.queued ? "の送信待ちに入れました" : "に送りました"}`, { label: "開く", run: () => openDbChat(chat) });
}
