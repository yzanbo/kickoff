// panel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export type { PanelTab, TerminalTarget } from "./tabs/panelTypes";
export type { PanelState } from "./state/panelState";
export type { PaneLayout, PaneLeaf, PaneNode, SplitDir } from "./layout/paneTree";
export { activeTabOf, homePane, isTabVisible, leavesOf, paneOfTab, singlePane } from "./layout/paneTree";
export { reconcileLayout } from "./layout/paneLayout";
export { forwardPanelOp } from "./state/panelMirror";
export type { DraftScope, PanelScope, PanelSurface, SavedTabs, StripProps, SurfaceExt, TabLook, ViewScope } from "./surface";
export { usePanel, type PanelController } from "./usePanel";
export { BrowserAdds, TerminalAdds } from "./openWith/OpenWithAdds";
export { Panel } from "./Panel";
export { MaximizeButton, type PanelFrame } from "./PanelTools";
export type { TabGroupBadge, TabGroupLookup } from "./kind";
export { useTabPage } from "./tabs/tabPageContext";
export { closeTabsWhere } from "./state/closeTabs";
export { adoptSidePanels, handSidePanelsOut, isSidePanel, ownSidePanelsAgain, ownSidePanelsOnly, sidePanelsHandedOut, takeSidePanelsBack } from "./state/panelHandOff";
export { isTabShown, panelOfTab } from "./state/tabPlace";
export { defineSurface, draftScope, panelKey, panelSurfaces, parsePanelKey } from "./surface";
export { defineTabKind, panelTabs, repointedAt, type TabFaceProps, type TabMenuProps, type TabPageProps, type WorkplaceMove } from "./kind";
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
  setPanelReplica,
  startPanelServerEvents,
  subscribePanels,
  surfaceOf,
  takePanels,
  usePanelOpen,
  usePanelState,
} from "./state/panelStore";
export { addTabBehind, closeTab, mapTabs, openInFocusedPane, openTab, patchTab, reopenInPanel, reopenOf, replaceTab, setPanelOpen, showTab, splitPane, syncPanel, togglePanel } from "./state/actions";
export {
  agentTabKey,
  browserTab,
  changesTab,
  chatKey,
  chatTab,
  childTab,
  fileTab,
  hostOf,
  newChatTab,
  newChildTab,
  newTabKey,
  noteTab,
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
  chatTabRowHidden: storage.settings.chatTabRowHidden,
  viewButtonHidden: storage.settings.viewButtonHidden
} as const;
export { PopoutTabWindow } from "./popout/PopoutTabWindow";
export { returnTabWindow } from "./popout/tabWindow";
