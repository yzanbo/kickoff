import type { ChatEventOf } from "@shared/chat/chatEvent";
import { cx } from "@/foundation/ui/lib/cx";
import { formatFullStamp, formatStamp } from "@/foundation/ui/lib/time";
import { ClaudeMark } from "@/features/ai/ui";
import { useOptionalSubagentNav } from "@/features/chat/ui";
import { useSubagentsView } from "./subagentsContext";

/** 裏で動かしたサブエージェントが終わった（その時刻の位置に 1 行）。「開く」で、設定の開き方（流れの中のカード / 右の欄）で開く */
export function SubagentEndNote({ event, agentKey }: { event: ChatEventOf<"subagent">; agentKey: string }) {
  const view = useSubagentsView();
  const nav = useOptionalSubagentNav();
  const name = view?.tree.byKey.get(agentKey)?.description ?? (event.data.description || "サブエージェント");
  const verb = event.data.status === "completed" ? "終わりました" : event.data.status === "failed" ? "失敗しました" : "止まりました";
  return (
    <div className={cx("event-note subagent-end", event.data.status === "failed" && "error")}>
      <span className="agent-icon">
        <ClaudeMark size={12} />
      </span>
      <span>
        裏で動かしたサブエージェント「{name}」が{verb}
      </span>
      <span className="event-time" title={formatFullStamp(event.created_at)}>
        {formatStamp(event.created_at)}
      </span>
      {nav && (
        <button type="button" className="link-button" title="このサブエージェントを開く（設定の開き方で、流れの中のカードか右の欄）" onClick={() => nav.open(agentKey)}>
          開く
        </button>
      )}
    </div>
  );
}
