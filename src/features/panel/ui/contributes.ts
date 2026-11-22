// panel が拡張点に出すもの（app/renderer/registry.ts が入れる）: まだ持ち主の機能へ移していないタブの種類 6（P7-2e で projects の 1 種類にまとめる）
import { panelTabs } from "./kind";
import { PANEL_TAB_KINDS } from "./tabs/tabKinds";

export const contributes = PANEL_TAB_KINDS.map((k) => panelTabs.item(k));
