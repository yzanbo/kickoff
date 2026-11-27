import type { ChatEventOf } from "@shared/chat/chatEvent";
import { QuestionAnswerMessage } from "@/features/conversation/ui/messages/QuestionAnswerMessage";
import { DenyReasonMessage } from "@/features/conversation/ui/messages/DenyReasonMessage";
import { hasDenyReason } from "@shared/chat/denyReason";

const RESOLVED_LABELS: Record<string, string> = {
  allow: "許可しました",
  allow_always: "常に許可しました",
  deny: "拒否しました",
  answer: "質問に回答しました",
};

/** 承認・質問に答えた記録（AI からの質問に答えた内容・拒否の理由は、自分の発言と同じ吹き出しで「質問への回答」「拒否の理由」として出す） */
export function ResolvedRow({ event }: { event: ChatEventOf<"approval_resolved"> }) {
  const data = event.data;
  if (data.action === "answer") return <QuestionAnswerMessage event={event} data={data} />;
  if (data.action === "deny" && hasDenyReason(data)) return <DenyReasonMessage event={event} data={data} />;
  if (data.kind === "question" && data.action === "deny") return <div className="event-note">質問をスキップしました</div>;
  return <div className="event-note">{RESOLVED_LABELS[data.action] ?? "回答済み"}</div>;
}

/** エラー・お知らせの 1 行 */
export function EventNote({ event }: { event: ChatEventOf<"error"> | ChatEventOf<"notice"> }) {
  return (
    <div className={event.type === "error" ? "event-note error" : "event-note"} id={`ev-${event.id}`}>
      {event.data.message}
    </div>
  );
}
