import { Bot, Globe } from "lucide-react";
import { useAgentBrowsing } from "./agentBrowsing";

/** ブラウザのタブの名前の前の印（ふだんは地球、AI が操作している間は「AI 操作中」のロボット） */
export function BrowserTabLead({ tab }: { tab: { key: string } }) {
  const browsing = useAgentBrowsing(tab.key);
  if (!browsing) return <Globe size={12} aria-hidden />;
  return (
    <span className="agent-browsing-mark" title="AI 操作中（チャットの AI がこのタブを見ています・操作しています）" aria-label="AI 操作中">
      <Bot size={12} aria-hidden />
    </span>
  );
}
