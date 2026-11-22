// browser が拡張点に出すもの（app/renderer/registry.ts が入れる）: ブラウザのタブの種類・欄 2 つ（右サイドバー・ブラウザの別ウィンドウ）と、ブラウザで開く行き先、右サイドバーのブラウザの画面
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { browserTabKind } from "./panel/tabKind";
import { browserWindowSurface, sideSurface } from "./panel/browserSurfaces";
import { browserTarget } from "./openTargets";
import { projectViews } from "@/features/projects/ui";
import { browserView } from "./projectViews";

export const contributes = [panelTabs.item(browserTabKind), panelSurfaces.item(sideSurface), panelSurfaces.item(browserWindowSurface), openTargets.item(browserTarget), projectViews.item(browserView)];
