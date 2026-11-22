// chatPanel が拡張点に出すもの（app/renderer/registry.ts が入れる）: チャットのタブの種類 5 つ、欄 3 つ（チャットのパネル・右の欄・別ウィンドウ）、新しいチャットの行き先と、「AI に渡す」の「新しいチャットで始める」、プロジェクトの画面のチャット、⌘N
import { settingsItems } from "@/features/settings/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { handOffTargets } from "@/features/attachments/ui";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { CHAT_SURFACES } from "./chatSurfaces";
import { CHAT_TAB_KINDS } from "./chatTabKinds";
import { newChatHandOff } from "./handOffTarget";
import { newChatTarget } from "./openTargets";
import { projectViews } from "@/features/projects/ui";
import { chatsView } from "./board/chatsView";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { chatPopout, chatsPopout, subagentPopout } from "./popoutKinds";
import { commands } from "@/foundation/ui/commands";
import { appHosts, openAppDialog } from "@/foundation/ui/shell/points";
import { chatPanelHosts } from "./appHosts";
import { chatPanelDisplayItems } from "./settings/appSettings";

export const contributes = [
  ...CHAT_TAB_KINDS.map((k) => panelTabs.item(k)),
  ...CHAT_SURFACES.map((s) => panelSurfaces.item(s)),
  openTargets.item(newChatTarget),
  handOffTargets.item(newChatHandOff),
  projectViews.item(chatsView),
  popoutKinds.item(subagentPopout),
  popoutKinds.item(chatPopout),
  popoutKinds.item(chatsPopout),
  // ⌘T はブラウザの「新しいタブ」と同じ手の動き。./appHosts.ts が、開いている（なければサイドバーで選んでいる）プロジェクトで始める（プロジェクトがなければ案内）
  commands.item({ id: "chat.new", title: "新しいチャット", keys: ["mod+n", "mod+t"], run: () => openAppDialog("newChat") }),
  // 設定の「表示」の欄
  ...chatPanelDisplayItems.map((i) => settingsItems.item(i)),
  // アプリの根に置く物（新しいチャットの頼み・⌘⇧A・下書きの片付け・別ウィンドウからのパネルの操作）
  ...chatPanelHosts.map((h) => appHosts.item(h)),
];
