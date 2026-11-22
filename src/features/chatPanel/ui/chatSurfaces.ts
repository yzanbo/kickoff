// チャットのパネル・チャットの別ウィンドウ・チャットの画面の右の欄の決まり（ui/contributes.ts が panelSurfaces に入れる）。
// タブの並べ方は ChatTabStrip（まとまり・タブに出す項目）、新しいタブのボタンは欄ごとの Adds
import { PanelRightClose } from "lucide-react";
import { defineSurface, linkedChatsExt } from "@/features/panel/ui";
import { AgentPanelAdds } from "./agents/AgentPanelAdds";
import { ChatPanelAdds } from "./ChatPanelAdds";
import { ChatTabStrip } from "./ChatTabStrip";

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
  Adds: ChatPanelAdds,
  Strip: ChatTabStrip,
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
  newChildHint: "「＋」で新しい子チャットを始められます。",
  // 新しいタブのボタンの代わりに、新しい子チャットと、右の欄に開けるもののメニュー
  Adds: AgentPanelAdds,
  newChild: true,
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
  Strip: ChatTabStrip,
});

export const CHAT_SURFACES = [chatsSurface, chatSideSurface, chatWindowSurface];
