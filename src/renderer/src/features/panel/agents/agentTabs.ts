import { isTabVisible } from "@/features/panel/layout/paneTree";
import { usePanelState } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";
import { agentTabKey } from "@/features/panel/tabs/tabKinds";

/**
 * そのサブエージェントを、チャットの画面の右の欄（サブエージェントの欄）で表示しているか（右の欄が開いていて、どれかのペインで表示中）。
 * 流れの中のカードに「右の欄で表示中」と添えるのに使う
 */
export function useShownInAgentPanel(chatId: number, agentKey: string): boolean {
  const state = usePanelState(panelKey("agents", chatId));
  return state.open && isTabVisible(state.layout, agentTabKey(agentKey));
}
