// projects が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の行き先・ゴミ箱の画面・チャットの右の欄のプロジェクトの画面のタブの種類・
// プロジェクトの設定の節（基本情報・参照資料・削除）・右サイドバーの別ウィンドウ・⌥⌘B・⌘K のプロジェクト
import { openTargets } from "@/foundation/ui/navigation/open";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { panelTabs } from "@/features/panel/ui";
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { projectViewTabKind } from "./chatSideView";
import { projectViewTarget } from "./openTargets";
import { projectViews } from "./projectViews";
import { basicSection, deleteSection, referencesSection } from "./settings/settingsSections";
import { trashView } from "./trashView";
import { sidePopout } from "./popoutKinds";
import { commands } from "@/foundation/ui/commands";
import { rightSidebarToggles } from "./rightSidebar/useRightSidebar";
import { paletteSources } from "@/features/palette/ui";
import { projectPaletteSource } from "./paletteSources";
import { projectsDisplayItems } from "./page/displaySettings";
import { appHosts } from "@/foundation/ui/shell/points";
import { projectsHosts } from "./appHosts";
import { routeLeaveGuards } from "@/foundation/ui/navigation/router";
import { leaveProjectView } from "./viewLeave";

export const contributes = [
  openTargets.item(projectViewTarget),
  projectViews.item(trashView),
  panelTabs.item(projectViewTabKind),
  settingsSections.item(basicSection),
  settingsSections.item(referencesSection),
  settingsSections.item(deleteSection),
  popoutKinds.item(sidePopout),
  routeLeaveGuards.item(leaveProjectView),
  paletteSources.item(projectPaletteSource),
  // ⌥ を押すと文字が変わるので、キーの位置で見る。エディタが先に受けても効く
  commands.item({
    id: "projects.toggleRightSidebar",
    title: "右サイドバーの開閉",
    keys: "alt+mod+code:KeyB",
    evenIfHandled: true,
    run: () => rightSidebarToggles.run(),
  }),
  // 設定の「表示」の欄
  ...projectsDisplayItems.map((i) => settingsItems.item(i)),
  // アプリのダイアログ（新しいプロジェクト・プロジェクトがないときの案内）
  ...projectsHosts.map((h) => appHosts.item(h)),
];
