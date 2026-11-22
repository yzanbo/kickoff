// files が拡張点に出すもの（app/renderer/registry.ts が入れる）: ファイルのタブの種類 2 つ・ファイルの右の欄と、ファイルの行き先、プロジェクトの画面のファイル・検索、⌘⇧F
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { fileTarget } from "./openTargets";
import { fileTabKind, projectFileTabKind } from "./fileTabKinds";
import { fileSurface } from "./fileSurface";
import { projectViews } from "@/features/projects/ui";
import { filesView, searchView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { filePopout } from "./popoutKinds";
import { codeSearchCommand } from "./codeSearchFocus";

export const contributes = [
  panelTabs.item(fileTabKind),
  panelTabs.item(projectFileTabKind),
  panelSurfaces.item(fileSurface),
  openTargets.item(fileTarget),
  projectViews.item(filesView),
  projectViews.item(searchView),
  popoutKinds.item(filePopout),
  codeSearchCommand,
];
