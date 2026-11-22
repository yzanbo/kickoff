// projects が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の行き先・ゴミ箱の画面・チャットの右の欄のプロジェクトの画面のタブの種類・
// プロジェクトの設定の節（基本情報・参照資料・削除）・右サイドバーの別ウィンドウ
import { openTargets } from "@/foundation/ui/navigation/open";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { panelTabs } from "@/features/panel/ui";
import { settingsSections } from "@/features/settings/ui";
import { projectViewTabKind } from "./chatSideView";
import { projectViewTarget } from "./openTargets";
import { projectViews } from "./projectViews";
import { basicSection, deleteSection, referencesSection } from "./settings/settingsSections";
import { trashView } from "./trashView";
import { sidePopout } from "./popoutKinds";

export const contributes = [
  openTargets.item(projectViewTarget),
  projectViews.item(trashView),
  panelTabs.item(projectViewTabKind),
  settingsSections.item(basicSection),
  settingsSections.item(referencesSection),
  settingsSections.item(deleteSection),
  popoutKinds.item(sidePopout),
];
