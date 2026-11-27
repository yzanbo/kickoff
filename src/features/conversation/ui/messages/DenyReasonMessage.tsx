import "./DenyReasonMessage.css";
import { Ban } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { AttachmentChips } from "@/features/attachments/ui";
import { AnswerBubble } from "./AnswerBubble";

/**
 * 承認を拒否したときに書いた理由（記録の approval_resolved の message / attachments）。AI に伝えた自分の言葉なので、
 * 自分の発言と同じ吹き出しに「拒否の理由」と添えて出す（AnswerBubble。理由を書かずに拒否したときは、この吹き出しでなく「拒否しました」の 1 行）
 */
export function DenyReasonMessage({ event, data }: { event: ChatEventOf<"approval_resolved">; data: Extract<ChatEventOf<"approval_resolved">["data"], { action: "deny" }> }) {
  const files = data.attachments ?? [];
  return (
    <AnswerBubble event={event} className="deny-reason" icon={<Ban size={12} aria-hidden />} label="拒否の理由" quoteText={data.message ?? ""} quoteNoun="拒否の理由">
      {data.message && <div className="deny-reason-text">{data.message}</div>}
      {files.length > 0 && (
        <div className="bubble-attachments">
          <AttachmentChips attachments={files} />
        </div>
      )}
    </AnswerBubble>
  );
}
