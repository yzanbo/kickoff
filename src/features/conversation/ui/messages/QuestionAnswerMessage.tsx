import "./QuestionAnswerMessage.css";
import { MessageCircleQuestion } from "lucide-react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { LazyDetails } from "@/foundation/ui/kit/LazyDetails";
import { AttachmentChips } from "@/features/attachments/ui";
import { openKey, useTimelineOpen } from "@/features/chat/ui";
import { AnswerBubble } from "./AnswerBubble";

/**
 * AI からの質問に答えた内容（記録の approval_resolved の answers / attachments）。自分の発言と同じ吹き出しに「質問への回答」と添えて出し（AnswerBubble）、
 * 質問ごとに、質問の文と選んだ答え（「その他」の文・添付も）を並べる。選んだ選択肢に図（preview）があれば、「選んだ図」を開いて見られる（記録の previews）
 */
export function QuestionAnswerMessage({ event, data }: { event: ChatEventOf<"approval_resolved">; data: Extract<ChatEventOf<"approval_resolved">["data"], { action: "answer" }> }) {
  const entries = Object.entries(data.answers);
  return (
    <AnswerBubble
      event={event}
      className="question-answer"
      icon={<MessageCircleQuestion size={12} aria-hidden />}
      label="質問への回答"
      quoteText={entries.map(([question, answer]) => `${question}\n→ ${Array.isArray(answer) ? answer.join("、") : answer}`).join("\n\n")}
      quoteNoun="回答"
    >
      <dl className="question-answer-list">
        {entries.map(([question, answer], i) => {
          const files = data.attachments?.[question] ?? [];
          return (
            <div key={question} className="question-answer-item">
              <dt>{question}</dt>
              <dd>{Array.isArray(answer) ? answer.join("、") : answer}</dd>
              {data.previews?.[question] && (
                <dd>
                  <PreviewDetails event={event} index={i} text={data.previews[question]} />
                </dd>
              )}
              {files.length > 0 && (
                <dd className="bubble-attachments">
                  <AttachmentChips attachments={files} />
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </AnswerBubble>
  );
}

/** 選んだ図（開閉は流れの見え方の店。キーは記録 ID と問いの番号） */
function PreviewDetails({ event, index, text }: { event: ChatEventOf<"approval_resolved">; index: number; text: string }) {
  const [open, setOpen] = useTimelineOpen(event.chat_id, openKey.questionPreview(event.id, index));
  return (
    <LazyDetails className="question-answer-preview" open={open} onOpenChange={setOpen} summary={<summary>選んだ図</summary>}>
      {() => <pre>{text}</pre>}
    </LazyDetails>
  );
}
