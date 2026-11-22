// チャットのタブの画面が右の欄を置く口（chat の ChatHost.side の実装。ChatTabPage が渡す）
import type { SidePanelPort } from "@/features/chat/ui";
import { AgentSplit } from "./agents/AgentSplit";
import { AgentPanelToggle } from "./agents/AgentPanelToggle";

export const sidePanelPort: SidePanelPort = { Frame: AgentSplit, Toggle: AgentPanelToggle };
