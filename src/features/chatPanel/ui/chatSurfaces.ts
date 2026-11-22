// チャットのパネル・チャットの別ウィンドウ・チャットの画面の右の欄の決まり（ui/contributes.ts が panelSurfaces に入れる）。
// タブの並べ方は ChatTabStrip（まとまり・タブに出す項目）、「表示」のメニューは ChatViewMenu、新しいタブのボタン・タブがないときの案内は欄ごとの Adds・EmptyHint
import { PanelRightClose } from "lucide-react";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { chatsPanel } from "@/features/chat/ui";
import { chatKey, defineSurface, projectOfPanel, type PanelScope } from "@/features/panel/ui";
import { linkedChatsExt } from "./state/linkedTabs";
import { useLinkedTabs } from "./state/useLinkedChats";
import { AgentPanelAdds, AgentPanelEmpty } from "./agents/AgentPanelAdds";
import { ChatPanelAdds, ChatPanelEmpty } from "./ChatPanelAdds";
import { ChatTabStrip } from "./ChatTabStrip";
import { ChatViewMenu } from "./tabs/ChatViewMenu";

/** チャットの別ウィンドウのチャット（そのプロジェクトのサイドバーのチャット。読むだけでタブはそろえない） */
function useWindowChats(key: string, scope: PanelScope) {
  return useLinkedTabs(key, projectOfPanel(key) ?? scope, false);
}

/** チャットのパネル（ボードの右・「チャット」タブ）。サイドバーに出ているチャットのタブをそろえる */
const chatsSurface = defineSurface({
  id: "kanban",
  accepts: ["chat"],
  closeOnEsc: true,
  whenEmpty: "close",
  // 横から出てきたパネルを、横へしまう（タブはそのまま残る）
  closeButton: { icon: PanelRightClose, label: "パネルを閉じる", keys: "Esc", at: "start" },
  maximize: "width",
  hideableTabs: true,
  emptyHint: "カードを押すと、ここにチャットが開きます。",
  slide: true,
  ext: linkedChatsExt,
  // サイドバーに出ているチャットを読み、タブをそろえる
  useChats: useLinkedTabs,
  Adds: ChatPanelAdds,
  Strip: ChatTabStrip,
  ViewMenu: ChatViewMenu,
  EmptyHint: ChatPanelEmpty,
  // 新しいチャットを送ったら、そのチャットを URL にする
  onChatCreated: (chat) => openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id }, { replace: true }),
});

/** チャットの画面の右の欄（サブエージェントの画面と、変更したファイル・返答に出てきたファイルを並べる。チャットのタブの中に入れ子で置く） */
const chatSideSurface = defineSurface({
  id: "agents",
  accepts: ["subagent", "file"],
  closeOnEsc: "focused",
  whenEmpty: "close",
  closeButton: { icon: PanelRightClose, label: "右の欄を閉じる", keys: "Esc", at: "right" },
  splitButtons: false,
  // 左の会話を覆って横幅いっぱいに広げる ⇔ 元の幅に戻す（タブの列の左端）
  maximize: "width",
  emptyHint:
    "サブエージェントのカードの「右の欄で開く」・変更したファイル・返答のファイルのチップ・子チャットとノートの札を押すと、ここに開きます。タブをドラッグすると、上下・左右に分けて並べられます。",
  // 新しいタブのボタンの代わりに、新しい子チャットと、右の欄に開けるもののメニュー（タブがないときの案内にも新しい子チャット）
  Adds: AgentPanelAdds,
  EmptyHint: AgentPanelEmpty,
  rootClass: "agent-panel",
  slide: true,
  Strip: ChatTabStrip,
});

/** チャットの別ウィンドウ: チャットだけ。サイドバーとそろえず（ext なし）、移した・ドラッグで足したチャットだけ。最後のタブがなくなればウィンドウごと閉じる（panel の popout/tabWindow.ts） */
const chatWindowSurface = defineSurface({
  id: "cwin",
  accepts: ["chat"],
  closeOnEsc: false,
  whenEmpty: "closeWindow",
  splitButtons: false,
  className: "as-sidebar",
  // そのプロジェクトのチャットを読むだけで、タブはそろえない（移したチャットだけを並べる）
  useChats: useWindowChats,
  Strip: ChatTabStrip,
  ViewMenu: ChatViewMenu,
  EmptyHint: ChatPanelEmpty,
  // このウィンドウで送ってできたチャットは、メインのウィンドウのチャットのパネルには出さない（サイドバーとの連動で足されたら、表示だけ消してもらう）
  onChatCreated: (chat) => postWindowMessage("tabMovedOut", { panel: chatsPanel(chat.project_id), key: chatKey(chat.id), kind: "chat" }),
});

export const CHAT_SURFACES = [chatsSurface, chatSideSurface, chatWindowSurface];
