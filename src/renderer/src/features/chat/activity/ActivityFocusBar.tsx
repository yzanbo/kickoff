import { ChevronDown, ChevronUp } from "lucide-react";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { agentHueStyle } from "@/features/chat/subagents/agentHues";
import type { ActivityFocus } from "./useActivityFocus";

/** 強調しているサブエージェントの帯（絞り込みのチップの下）: 名前・何件目か・前 / 次へ・強調をやめる */
export function ActivityFocusBar({ focus, name, hue, onClear }: { focus: ActivityFocus; name: string; hue: number | undefined; onClear: () => void }) {
  const { position, total, step } = focus;
  return (
    <div className="activity-focus-bar" style={agentHueStyle(hue)} role="status">
      <span className="agent-dot" aria-hidden />
      <span className="activity-focus-name">{name}</span>
      <span className="activity-focus-count">{total > 0 ? `の動き ${position + 1} / ${total}` : "の動きはまだありません"}</span>
      <span className="activity-focus-actions">
        <IconButton icon={ChevronUp} size={14} label="前の行へ" disabled={total < 2} onClick={() => step(-1)} />
        <IconButton icon={ChevronDown} size={14} label="次の行へ" disabled={total < 2} onClick={() => step(1)} />
        <CloseButton size={14} label="強調をやめる" onClick={onClear} />
      </span>
    </div>
  );
}
