import { MessageCircleQuestion } from "lucide-react";
import type { Attachment, RunEvent } from "../../../../core/types";
import { formatFullDateTime, formatMessageTime } from "../../time";
import { AttachmentChip } from "./AttachmentChip";

/**
 * AI からの質問に答えた内容（記録の approval_resolved の answers / attachments）。自分の発言と同じ吹き出しで右に出し、
 * 上に「質問への回答」と添えて、ふつうの指示と見分けられるようにする。質問ごとに、質問の文と選んだ答え（「その他」の文・添付も）を並べる
 */
export function QuestionAnswerMessage({ event }: { event: RunEvent }) {
  const data = event.data as { answers?: Record<string, string | string[]>; attachments?: Record<string, Attachment[]> };
  const entries = Object.entries(data.answers ?? {});
  return (
    <div className="user-message question-answer">
      <div className="bubble user" id={`ev-${event.id}`}>
        <div className="question-answer-label">
          <MessageCircleQuestion size={12} aria-hidden />
          質問への回答
        </div>
        <dl className="question-answer-list">
          {entries.map(([question, answer]) => {
            const files = data.attachments?.[question] ?? [];
            return (
              <div key={question} className="question-answer-item">
                <dt>{question}</dt>
                <dd>{Array.isArray(answer) ? answer.join("、") : answer}</dd>
                {files.length > 0 && (
                  <dd className="bubble-attachments">
                    {files.map((a) => (
                      <AttachmentChip key={a.id} attachment={a} siblings={files} />
                    ))}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      </div>
      <div className="message-meta">
        <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
          {formatMessageTime(event.created_at)}
        </time>
      </div>
    </div>
  );
}
