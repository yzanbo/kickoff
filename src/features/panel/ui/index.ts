// panel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export type { PanelTab, TerminalTarget } from "./tabs/panelTypes";
export type { PaneLeaf, SplitDir } from "./layout/paneTree";
export { isTabVisible, paneOfTab } from "./layout/paneTree";
export { forwardPanelOp } from "./state/panelMirror";
export type { DraftScope, PanelScope, PanelSurface, StripProps, SurfaceExt, TabLook, ViewScope } from "./surface";
export type { PanelController } from "./usePanel";
export { Panel } from "./Panel";
export type { TabGroupBadge, TabGroupLookup } from "./kind";
export { useTabPage } from "./tabs/tabPageContext";
export { closeTabsWhere } from "./state/closeTabs";
export { defineSurface, draftScope, panelKey, panelSurfaces, parsePanelKey } from "./surface";
export { defineTabKind, panelTabs, type TabFaceProps, type TabMenuProps, type TabPageProps } from "./kind";
export { panelScreen, projectOfPanel } from "./surfaces";
export {
  allPanels,
  createPanelStore,
  dispatchPanel,
  installPanelStore,
  isPanelMounted,
  kindOf,
  movePanel,
  panelsVersion,
  panelStateOf,
  restorePanelTabs,
  startPanelServerEvents,
  subscribePanels,
  takePanels,
  usePanelOpen,
  usePanelState,
} from "./state/panelStore";
export { addTabBehind, closeTab, openTab, replaceTab, setPanelOpen, showTab, splitPane, syncPanel, togglePanel } from "./state/actions";
export {
  agentTabKey,
  browserTab,
  changesTab,
  chatKey,
  chatTab,
  childTab,
  databaseTab,
  fileTab,
  githubTab,
  hostOf,
  newChatTab,
  newChildTab,
  newTabKey,
  noteTab,
  projectToolTab,
  projectViewTab,
  reopenOf,
  subagentTab,
  terminalTab,
  terminalTitle,
} from "./tabs/tabData";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const panelSettings = {
  width: storage.settings.width,
  maximized: storage.settings.maximized,
  tabHidden: storage.settings.tabHidden,
  tabTwoLine: storage.settings.tabTwoLine,
  tabOverflow: storage.settings.tabOverflow,
  bottomHeight: storage.settings.bottomHeight,
} as const;
