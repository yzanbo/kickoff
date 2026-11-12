// 別ウィンドウからメインのウィンドウへの知らせのうち、チャットの画面ではなく App が受け取るもの
// （ファイルタブ・チャット・メモ・子チャットを開く・新しい子チャットのタブ・文を入れた新しいチャットのタブを開く・子チャットから親へ・別ウィンドウを右の欄に戻す。チャットの画面への知らせは features/chat/pane/windowMessages）
import { knownChat } from "@/stores/chats";
import { handBackToParent, openAskChild, openChildSide, revealInParent } from "@/features/chat/children/openChild";
import { openSeededChat } from "@/features/chat/handoff/workplace";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";
import { dockPopout } from "@/features/popout/dockPopout";
import { openChat, openProjectFile } from "./router";
import type { WindowMessage } from "./windowBus";

export function handleMainWindowMessage(m: WindowMessage) {
  if (m.type === "openProjectFile") openProjectFile(m.projectId, m.file);
  else if (m.type === "openChat") openChat(m.projectId, m.chatId);
  else if (m.type === "openMemo") openMemoFromChat(m);
  else if (m.type === "dockPopout") dockPopout(m.route);
  else if (m.type === "askChild") openAskChild(m);
  else if (m.type === "openSeededChat") openSeededChat(m.projectId, m.place, m);
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
