// 別ウィンドウからメインのウィンドウへの知らせのうち、チャットの画面ではなく App が受け取るもの
// （ファイルタブ・メモ・子チャットを開く・子チャットから親へ。チャットの画面への知らせは features/chat/pane/windowMessages）
import { knownChat } from "@/stores/chats";
import { handBackToParent, openChildSide, revealInParent } from "@/features/chat/children/openChild";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";
import { openProjectFile } from "./router";
import type { WindowMessage } from "./windowBus";

export function handleMainWindowMessage(m: WindowMessage) {
  if (m.type === "openProjectFile") openProjectFile(m.projectId, m.file);
  else if (m.type === "openMemo") openMemoFromChat(m);
  else if (m.type === "openChild") {
    const chat = knownChat(m.chatId);
    if (chat) openChildSide(chat);
  } else if (m.type === "childToParent") {
    const child = knownChat(m.childId);
    if (!child) return;
    if (m.action === "reveal") revealInParent(child);
    else handBackToParent(child, m.text ?? "");
  }
}
