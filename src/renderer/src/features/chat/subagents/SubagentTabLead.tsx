import { Bot } from "lucide-react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ToolStatusIcon } from "@/features/chat/tools/ToolStatusIcon";
import type { ToolStatus } from "@/features/chat/tools/toolStatus";
import { agentHueStyle } from "./agentHues";
import { subagentStatusLabel } from "./subagentList";
import { useSubagentsView } from "./subagentsContext";

/** サブエージェントの状態を、ツールと同じアイコンで（実行中 = 回る印 / 完了 = ✓ / 失敗 = ✕ / 中断 = −） */
const ICON_STATUS: Record<SubagentEntry["status"], ToolStatus> = { running: "running", completed: "done", failed: "failed", stopped: "stopped" };

/**
 * 右の欄（サブエージェントの欄）のタブの名前の前に置く、そのサブエージェントの状態のアイコン（乗せると状態の文）。
 * タブの上の端に、そのサブエージェントの色の線を引く（カードの帯・動きの線と同じ色。どのタブがどのサブエージェントかを見分ける。CSS の .subagent-tab-lead）。
 * 一覧にない（巻き戻して消えたなど）・チャットの画面の外では、ふつうのアイコン
 */
export function SubagentTabLead({ tab }: { tab: { agentKey: string } }) {
  const view = useSubagentsView();
  const entry = view?.tree.byKey.get(tab.agentKey);
  if (!view || !entry) return <Bot size={12} className="muted" aria-hidden />;
  return (
    <span className="subagent-tab-lead" style={agentHueStyle(view.hues.get(entry.key))}>
      <ToolStatusIcon status={ICON_STATUS[entry.status]} label={subagentStatusLabel(entry)} />
    </span>
  );
}
