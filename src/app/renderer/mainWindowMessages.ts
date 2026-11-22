// 別ウィンドウからメインのウィンドウへの知らせのうち、チャットの画面ではなく App が受け取るもの
// （行き先・画面・App のダイアログ・ノート・子チャットを開く・新しい子チャットのタブ・文を入れた新しいチャットのタブを開く・子チャットから親へ・別ウィンドウを右の欄に戻す・
// サイドバーの別ウィンドウからのパネルの操作。チャットの画面への知らせは features/chat/ui/screen/chatScreens.ts）。
// 知らせの種類は持ち主の機能の ui/windowMessages.ts。受け手を持ち主の機能の appHosts へ移すまでは、ここでまとめて受ける
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { openAskChild, openChat } from "@/features/chat/ui";
import { handBackToParent, revealInParent } from "@/features/childChats/ui";
import { openSeededChat } from "@/features/chatPanel/ui/openSeededChat";
import type { PanelOp } from "@/features/chatPanel/ui/windowMessages";
import { openNoteFromChat } from "@/features/notes/ui/openNoteFrom";
import { dockPopout } from "@/app/renderer/popout/dockPopout";
import { openChatSplit } from "@/features/chatPanel/ui/board/openChatSplit";
import { openBrowserTab } from "@/features/browser/ui/panel/openBrowserTab";
import { discardDraft, moveDraftToProject, openDraft, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { receiveForwarded } from "@/foundation/ui/navigation/popoutNavigation";
import { popoutKey } from "@/foundation/ui/navigation/popout";
import { onWindowMessage, postWindowMessage } from "@/foundation/ui/navigation/windowBus";

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

/** メインのウィンドウ: 別ウィンドウからの知らせを受ける（App が 1 回。やめるときは返り値を呼ぶ） */
export function receiveMainWindowMessages(): () => void {
  const offs = [
    receiveForwarded(),
    onWindowMessage("panelOp", runPanelOp),
    onWindowMessage("openNote", (m) => openNoteFromChat(m)),
    onWindowMessage("dockPopout", ({ route }) => {
      // 開き直し終えたら別ウィンドウに知らせる（失敗しても閉じさせる）
      void dockPopout(route)
        .catch((e: unknown) => console.error("[popout] 欄に戻せませんでした", e))
        .finally(() => postWindowMessage("docked", { key: popoutKey(route) }));
    }),
    onWindowMessage("askChild", (m) => openAskChild(m)),
    onWindowMessage("openSeededChat", (m) => openSeededChat(m.projectId, m.place, m)),
    onWindowMessage("openChild", (m) => {
      const chat = knownChat(m.chatId);
      if (chat) openChat(chat, "side");
    }),
    onWindowMessage("childToParent", (m) => {
      const child = knownChat(m.childId);
      if (!child) return;
      if (m.action === "reveal") revealInParent(child);
      else handBackToParent(child, m.text ?? "");
    }),
  ];
  return () => {
    for (const off of offs) off();
  };
}
