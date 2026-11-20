// 別ウィンドウからメインのウィンドウへの知らせのうち、チャットの画面ではなく App が受け取るもの
// （ファイルタブ・チャット・ノート・子チャットを開く・新しい子チャットのタブ・文を入れた新しいチャットのタブを開く・子チャットから親へ・別ウィンドウを右の欄に戻す・
// 別ウィンドウの中で移った画面と App のダイアログ・サイドバーの別ウィンドウからのパネルの操作。チャットの画面への知らせは features/chat/pane/windowMessages）
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { handBackToParent, openAskChild, openChildSide, revealInParent } from "@/features/chat/ui/open/openChat";
import { openSeededChat } from "@/features/chatPanel/ui/openSeededChat";
import { openNoteFromChat } from "@/features/notes/ui/openNoteFrom";
import { dockPopout } from "@/app/renderer/popout/dockPopout";
import { openChatSplit } from "@/features/chatPanel/ui/board/openChatSplit";
import { openBrowserTab } from "@/features/browser/ui/panel/openBrowserTab";
import { discardDraft, moveDraftToProject, openDraft, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { handleForwarded } from "@/foundation/ui/navigation/popoutNavigation";
import { popoutKey } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { postWindowMessage, type PanelOp, type WindowMessage } from "@/foundation/ui/navigation/windowBus";

/** サイドバーの別ウィンドウから頼まれた、このウィンドウのパネルを変える操作 */
function runPanelOp(o: PanelOp) {
  if (o.op === "openDraft") openDraft(o.draft);
  else if (o.op === "openDraftSplit") openDraftSplit(o.draft, o.dir);
  else if (o.op === "setDraftTitle") setDraftTitle(o.draft, o.title);
  else if (o.op === "moveDraftToProject") moveDraftToProject(o.draft, o.projectId);
  else if (o.op === "setDraftGroup") setDraftGroup(o.draft, o.group, o.groupName);
  else if (o.op === "togglePinDraft") togglePinDraft({ ...o.draft, pinned: o.pinned });
  else if (o.op === "discardDraft") discardDraft(o.draft);
  else if (o.op === "openBrowser") openBrowserTab(o.panel, o.url);
  else openChatSplit(o.chat, o.dir);
}

export function handleMainWindowMessage(m: WindowMessage) {
  if (handleForwarded(m)) return;
  if (m.type === "panelOp") runPanelOp(m.op);
  else if (m.type === "openProjectFile") openTarget({ kind: "file", projectId: m.projectId, ...m.file });
  else if (m.type === "openChat") openTarget({ kind: "chat", projectId: m.projectId, chatId: m.chatId });
  else if (m.type === "openNote") openNoteFromChat(m);
  else if (m.type === "dockPopout") {
    const { route } = m;
    // 開き直し終えたら別ウィンドウに知らせる（失敗しても閉じさせる）
    void dockPopout(route)
      .catch((e: unknown) => console.error("[popout] 欄に戻せませんでした", e))
      .finally(() => postWindowMessage({ type: "docked", key: popoutKey(route) }));
  }
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
