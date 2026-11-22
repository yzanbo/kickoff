// panel が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘\ ピントのあるペインを右に分ける
import { commands } from "@/foundation/ui/commands";
import { IS_MAC } from "@/foundation/ui/lib/keys";
import { focusedPanelKey } from "./panelHost";
import { splitShownTab } from "./state/actions";

export const contributes = [
  commands.item({
    id: "panel.splitRight",
    title: "ピントのあるペインを右に分ける",
    // ピントのあるいちばん内側の欄だけ（下のパネルはそちらにピントがあるときだけ）。キーの位置で見る（いまは Mac の ⌘ だけ）
    keys: "mod+code:Backslash",
    windows: "both",
    evenIfHandled: true,
    run: () => {
      const key = focusedPanelKey();
      if (!IS_MAC || key === undefined) return false;
      splitShownTab(key, "row");
    },
  }),
];
