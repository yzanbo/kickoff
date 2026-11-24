// terminal が拡張点に出すもの（app/renderer/registry.ts が入れる）: ターミナルのタブの種類（と AI に返す説明）とフッターの欄・⌃` / ⌘J
import { settingsSections } from "@/features/settings/ui";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { terminalTabKind } from "./terminalTabKind";
import { bottomSurface } from "./bottom/bottomSurface";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { terminalPopout } from "./popoutKinds";
import { commands } from "@/foundation/ui/commands";
import { bottomToggles } from "./bottom/useBottomPanel";
import { terminalSection } from "./settings/appSettings";
import { describeTab, userViewTabs } from "@/features/userView/ui";

export const contributes = [
  panelTabs.item(terminalTabKind),
  userViewTabs.item(describeTab("terminal", (t) => ({ kind: "terminal", label: t.title ?? t.label, project_id: t.projectId }))),
  panelSurfaces.item(bottomSurface),
  popoutKinds.item(terminalPopout),
  // ⌃` はキーの位置で見る。ターミナルの中でも効くよう capture の段で受ける
  commands.item({
    id: "terminal.toggleBottom",
    title: "ターミナルの開閉",
    keys: ["ctrl+code:Backquote", "mod+j"],
    capture: true,
    run: () => bottomToggles.run(),
  }),
  // アプリの設定の節・欄
  settingsSections.item(terminalSection),
];
