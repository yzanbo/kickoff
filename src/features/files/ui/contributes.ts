// files が拡張点に出すもの（app/renderer/registry.ts が入れる）: ファイルのタブの種類 2 つと、ファイルの行き先
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelTabs } from "@/features/panel/ui";
import { fileTarget } from "./openTargets";
import { fileTabKind, projectFileTabKind } from "./fileTabKinds";

export const contributes = [panelTabs.item(fileTabKind), panelTabs.item(projectFileTabKind), openTargets.item(fileTarget)];
