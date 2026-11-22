// panel が拡張点に出すもの（app/renderer/registry.ts が入れる）: いまのタブの種類 17 と欄 8（持ち主の機能へ移すまで panel に置く）
import { panelTabs } from "./kind";
import { panelSurfaces } from "./surface";
import { PANEL_SURFACES } from "./surfaces";
import { PANEL_TAB_KINDS } from "./tabs/tabKinds";

export const contributes = [...PANEL_TAB_KINDS.map((k) => panelTabs.item(k)), ...PANEL_SURFACES.map((s) => panelSurfaces.item(s))];
