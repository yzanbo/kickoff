// terminal が拡張点に出すもの（app/renderer/registry.ts が入れる）: ターミナルのタブの種類とフッターの欄
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { terminalTabKind } from "./terminalTabKind";
import { bottomSurface } from "./bottom/bottomSurface";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { terminalPopout } from "./popoutKinds";

export const contributes = [panelTabs.item(terminalTabKind), panelSurfaces.item(bottomSurface), popoutKinds.item(terminalPopout)];
