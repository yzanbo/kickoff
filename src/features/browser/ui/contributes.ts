// browser が拡張点に出すもの（app/renderer/registry.ts が入れる）: ブラウザのタブの種類（と AI に返す説明）・欄 2 つ（右サイドバー・ブラウザの別ウィンドウ）と、ブラウザで開く行き先、右サイドバーのブラウザの画面
import { settingsSections } from "@/features/settings/ui";
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { browserTabKind } from "./panel/tabKind";
import { browserWindowSurface, sideSurface } from "./panel/browserSurfaces";
import { browserTarget } from "./openTargets";
import { projectViews } from "@/features/projects/ui";
import { browserView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { browserPopout } from "./popoutKinds";
import { browserSection } from "./settings/appSettings";
import { appHosts } from "@/foundation/ui/shell/points";
import { agentBrowserHost } from "./appHosts";
import { describeTab, userViewTabs } from "@/features/userView/ui";

export const contributes = [
  panelTabs.item(browserTabKind),
  userViewTabs.item(describeTab("browser", (t) => ({ kind: "browser", url: t.current ?? t.url, title: t.title }))),
  panelSurfaces.item(sideSurface), panelSurfaces.item(browserWindowSurface), openTargets.item(browserTarget), projectViews.item(browserView), popoutKinds.item(browserPopout), settingsSections.item(browserSection), appHosts.item(agentBrowserHost),
];
