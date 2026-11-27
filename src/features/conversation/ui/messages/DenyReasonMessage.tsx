import "./DenyReasonMessage.css";
import { Ban } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { formatFullDateTime, formatMessageTime } from "@/foundation/ui/lib/time";
import { AttachmentChips } from "@/features/attachments/ui";

/**
 * 承認を拒否したときに書いた理由（記録の approval_resolved の message / attachments）。AI に伝えた自分の言葉なので、自分の発言と同じ吹き出しで右に出し、
 * 上に「拒否の理由」と添えて、ふつうの指示と見分けられるようにする（理由を書かずに拒否したときは、この吹き出しでなく「拒否しました」の 1 行）
 */
export function DenyReasonMessage({ event, data }: { event: ChatEventOf<"approval_resolved">; data: Extract<ChatEventOf<"approval_resolved">["data"], { action: "deny" }> }) {
  const files = data.attachments ?? [];
  return (
    <div className="user-message deny-reason">
      <div
        className="bubble user"
        id={`ev-${event.id}`}
        // 選ばずに右クリックしたときに、理由を丸ごと「チャットに追加」・コピーできるようにする（useQuoteMenu）
        data-quote-text={data.message ?? ""}
        data-quote-noun="拒否の理由"
      >
        <div className="message-kind-label">
          <Ban size={12} aria-hidden />
          拒否の理由
        </div>
        {data.message && <div className="deny-reason-text">{data.message}</div>}
        {files.length > 0 && (
          <div className="bubble-attachments">
            <AttachmentChips attachments={files} />
          </div>
        )}
      </div>
      <div className="message-meta">
        <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
          {formatMessageTime(event.created_at)}
        </time>
      </div>
    </div>
  );
}
