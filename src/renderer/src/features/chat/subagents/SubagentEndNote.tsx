import type { ChatEventOf } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatFullStamp, formatStamp } from "@/lib/time";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { useSubagentsView } from "./subagentsContext";

/** 裏で動かしたサブエージェントが終わった（その時刻の位置に 1 行）。押すとそのカードへ移って開く */
export function SubagentEndNote({ event, agentKey }: { event: ChatEventOf<"subagent">; agentKey: string }) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  const name = view?.tree.byKey.get(agentKey)?.description ?? (event.data.description || "サブエージェント");
  const verb = event.data.status === "completed" ? "終わりました" : event.data.status === "failed" ? "失敗しました" : "止まりました";
  return (
    <div className={cx("event-note subagent-end", event.data.status === "failed" && "error")}>
      <span className="subagent-icon">
        <ClaudeMark size={12} />
      </span>
      <span>
        裏で動かしたサブエージェント「{name}」が{verb}
      </span>
      <span className="event-time" title={formatFullStamp(event.created_at)}>
        {formatStamp(event.created_at)}
      </span>
      {pane && (
        <button type="button" className="link-button" onClick={() => pane.revealSubagent(agentKey)}>
          カードへ
        </button>
      )}
    </div>
  );
}
