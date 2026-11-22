import { isTabVisible } from "@/features/panel/ui/layout/paneTree";
import { agentTabKey, panelKey, usePanelState } from "@/features/panel/ui";

/**
 * そのサブエージェントを、チャットの画面の右の欄（サブエージェントの欄）で表示しているか（右の欄が開いていて、どれかのペインで表示中）。
 * 流れの中のカードに「右の欄で表示中」と添えるのに使う
 */
export function useShownInAgentPanel(chatId: number, agentKey: string): boolean {
  const state = usePanelState(panelKey("agents", chatId));
  return state.open && isTabVisible(state.layout, agentTabKey(agentKey));
}
