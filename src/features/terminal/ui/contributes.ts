// terminal が拡張点に出すもの（app/renderer/registry.ts が入れる）: ターミナルのタブの種類とフッターの欄・⌃` / ⌘J
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { terminalTabKind } from "./terminalTabKind";
import { bottomSurface } from "./bottom/bottomSurface";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { terminalPopout } from "./popoutKinds";
import { commands } from "@/foundation/ui/commands";
import { IS_MAC } from "@/foundation/ui/lib/keys";
import { bottomToggles } from "./bottom/useBottomPanel";

export const contributes = [
  panelTabs.item(terminalTabKind),
  panelSurfaces.item(bottomSurface),
  popoutKinds.item(terminalPopout),
  // ⌃` はキーの位置で見る。ターミナルの中でも効くよう capture の段で受ける（⌘J はいまは Mac の ⌘ だけ）
  commands.item({
    id: "terminal.toggleBottom",
    title: "ターミナルの開閉",
    keys: ["ctrl+code:Backquote", "mod+j"],
    capture: true,
    run: ({ event }) => (IS_MAC || event?.code === "Backquote") && bottomToggles.run(),
  }),
];
