// panel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export type { TerminalTarget } from "./tabs/panelTypes";
export type { SplitDir } from "./layout/paneTree";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const panelSettings = {
  width: storage.settings.width,
  maximized: storage.settings.maximized,
  tabHidden: storage.settings.tabHidden,
  tabTwoLine: storage.settings.tabTwoLine,
  tabOverflow: storage.settings.tabOverflow,
  bottomHeight: storage.settings.bottomHeight,
} as const;
