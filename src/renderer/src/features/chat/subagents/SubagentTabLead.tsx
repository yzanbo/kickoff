import { Bot } from "lucide-react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ToolStatusIcon } from "@/features/chat/tools/ToolStatusIcon";
import type { ToolStatus } from "@/features/chat/tools/toolStatus";
import { subagentStatusLabel } from "./subagentList";
import { useSubagentsView } from "./subagentsContext";

/** サブエージェントの状態を、ツールと同じアイコンで（実行中 = 回る印 / 完了 = ✓ / 失敗 = ✕ / 中断 = −） */
const ICON_STATUS: Record<SubagentEntry["status"], ToolStatus> = { running: "running", completed: "done", failed: "failed", stopped: "stopped" };

/**
 * 右の欄（サブエージェントの欄）のタブの名前の前に置く、そのサブエージェントの状態のアイコン（乗せると状態の文）。
 * タブの上の線・枠・「サブ」の札は、メモ・子チャットのタブと同じ形で種類の色（tabKinds の badge）。一覧にない（巻き戻して消えたなど）・チャットの画面の外では、ふつうのアイコン
 */
export function SubagentTabLead({ tab }: { tab: { agentKey: string } }) {
  const view = useSubagentsView();
  const entry = view?.tree.byKey.get(tab.agentKey);
  if (!view || !entry) return <Bot size={12} className="muted" aria-hidden />;
  return (
    <span className="subagent-tab-lead">
      <ToolStatusIcon status={ICON_STATUS[entry.status]} label={subagentStatusLabel(entry)} />
    </span>
  );
}
