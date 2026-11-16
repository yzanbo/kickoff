// 別ウィンドウからメインのウィンドウへの知らせのうち、チャットの画面ではなく App が受け取るもの
// （ファイルタブ・チャット・メモ・子チャットを開く・新しい子チャットのタブ・文を入れた新しいチャットのタブを開く・子チャットから親へ・別ウィンドウを右の欄に戻す・
// 別ウィンドウの中で移った画面と App のダイアログ・サイドバーの別ウィンドウからのパネルの操作。チャットの画面への知らせは features/chat/pane/windowMessages）
import { knownChat } from "@/stores/chats";
import { handBackToParent, openAskChild, openChildSide, revealInParent } from "@/features/chat/children/openChild";
import { openSeededChat } from "@/features/chat/handoff/workplace";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";
import { dockPopout } from "@/features/popout/dockPopout";
import { openChatSplit } from "@/features/panel/board/openChatSplit";
import { discardDraft, moveDraftToProject, openDraft, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft } from "@/features/panel/state/panelDrafts";
import { handleForwarded } from "./popoutNavigation";
import { openChat, openProjectFile } from "./router";
import type { PanelOp, WindowMessage } from "./windowBus";

/** サイドバーの別ウィンドウから頼まれた、このウィンドウのパネルを変える操作 */
function runPanelOp(o: PanelOp) {
  if (o.op === "openDraft") openDraft(o.draft);
  else if (o.op === "openDraftSplit") openDraftSplit(o.draft, o.dir);
  else if (o.op === "setDraftTitle") setDraftTitle(o.draft, o.title);
  else if (o.op === "moveDraftToProject") moveDraftToProject(o.draft, o.projectId);
  else if (o.op === "setDraftGroup") setDraftGroup(o.draft, o.group, o.groupName);
  else if (o.op === "togglePinDraft") togglePinDraft({ ...o.draft, pinned: o.pinned });
  else if (o.op === "discardDraft") discardDraft(o.draft);
  else openChatSplit(o.chat, o.dir);
}

export function handleMainWindowMessage(m: WindowMessage) {
  if (handleForwarded(m)) return;
  if (m.type === "panelOp") runPanelOp(m.op);
  else if (m.type === "openProjectFile") openProjectFile(m.projectId, m.file);
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
