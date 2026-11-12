// DB クライアントから新しいチャットを作って開く（「AI に直してもらう」「AI に聞く」で共通。別ウィンドウの中なら、メインのウィンドウで開く）
import { api } from "@/api";
import { parsePopout } from "@/app/popout";
import { openChat } from "@/app/router";
import { postToMainWindow } from "@/app/windowBus";
import { addChat } from "@/stores/chats";

/** 新しいチャットに text を送って作り、そのチャットを開く */
export async function startDbChat(projectId: number, text: string, title: string): Promise<void> {
  const chat = await api.startChat(projectId, { text, title });
  addChat(chat);
  if (parsePopout(location.hash) !== undefined) postToMainWindow({ type: "openChat", projectId, chatId: chat.id });
  else openChat(projectId, chat.id);
}
