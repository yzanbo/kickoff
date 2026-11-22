// browser が拡張点に出すもの（app/renderer/registry.ts が入れる）: ブラウザのタブの種類
import { panelTabs } from "@/features/panel/ui";
import { browserTabKind } from "./panel/tabKind";

export const contributes = [panelTabs.item(browserTabKind)];
