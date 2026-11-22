// projects が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の行き先・ゴミ箱の画面・チャットの右の欄のプロジェクトの画面のタブの種類
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelTabs } from "@/features/panel/ui";
import { projectViewTabKind } from "./chatSideView";
import { projectViewTarget } from "./openTargets";
import { projectViews } from "./projectViews";
import { trashView } from "./trashView";

export const contributes = [openTargets.item(projectViewTarget), projectViews.item(trashView), panelTabs.item(projectViewTabKind)];
