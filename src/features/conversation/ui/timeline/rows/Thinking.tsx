import { ChevronRight } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { formatDuration, formatFullStamp, formatStamp } from "@/foundation/ui/lib/time";
import { LazyDetails } from "@/features/conversation/ui/LazyDetails";
import { openKey, useTimelineOpen } from "@/features/chat/ui";

/**
 * 思考の行（「8秒間思考しました」。中身があれば開いて読める）。後ろに考え始めた時刻
 * （記録は考え終えたときに残るので、かかった時間を引く。乗せると年月日と考え終えた時刻）
 */
export function Thinking({ event }: { event: ChatEventOf<"thinking"> }) {
  const { text, duration_ms: durationMs } = event.data;
  const at = event.created_at;
  // 開閉は流れの見え方の店（画面を作り直しても開いたまま）
  const [open, setOpen] = useTimelineOpen(event.chat_id, openKey.thinking(event.id));
  const label =
    durationMs === undefined ? "思考しました" : `${formatDuration(durationMs)}${durationMs < 3_600_000 ? "間" : ""}思考しました`;
  const start = new Date(Date.parse(at) - (durationMs ?? 0)).toISOString();
  const time = (
    <span className="event-time" title={`開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(at)}`}>
      {formatStamp(start)}
    </span>
  );
  if (!text.trim())
    return (
      <div className="event-note thinking">
        {label}
        {time}
      </div>
    );
  // 思考の全文は、初めて開いたときに作る
  return (
    <LazyDetails
      className="event-note thinking"
      open={open}
      onOpenChange={setOpen}
      summary={
        <summary className="fold-summary">
          <ChevronRight size={13} className="tool-chevron" />
          {label}
          {time}
        </summary>
      }
    >
      {() => <div className="thinking-body">{text}</div>}
    </LazyDetails>
  );
}
