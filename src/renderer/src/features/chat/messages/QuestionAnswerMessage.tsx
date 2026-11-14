import { MessageCircleQuestion } from "lucide-react";
import type { ChatEventOf } from "@shared/types";
import { formatFullDateTime, formatMessageTime } from "@/lib/time";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";

/**
 * AI からの質問に答えた内容（記録の approval_resolved の answers / attachments）。自分の発言と同じ吹き出しで右に出し、
 * 上に「質問への回答」と添えて、ふつうの指示と見分けられるようにする。質問ごとに、質問の文と選んだ答え（「その他」の文・添付も）を並べる。
 * 選んだ選択肢に図（preview）があれば、「選んだ図」を開いて見られる（記録の previews）
 */
export function QuestionAnswerMessage({ event, data }: { event: ChatEventOf<"approval_resolved">; data: Extract<ChatEventOf<"approval_resolved">["data"], { action: "answer" }> }) {
  const entries = Object.entries(data.answers);
  return (
    <div className="user-message question-answer">
      <div
        className="bubble user"
        id={`ev-${event.id}`}
        // 選ばずに右クリックしたときに、質問と答えを丸ごと「チャットに追加」・コピーできるようにする（useQuoteMenu）
        data-quote-text={entries.map(([question, answer]) => `${question}\n→ ${Array.isArray(answer) ? answer.join("、") : answer}`).join("\n\n")}
        data-quote-noun="回答"
      >
        <div className="message-kind-label">
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
                {data.previews?.[question] && (
                  <dd>
                    <details className="question-answer-preview">
                      <summary>選んだ図</summary>
                      <pre>{data.previews[question]}</pre>
                    </details>
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
      </div>
      <div className="message-meta">
        <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
          {formatMessageTime(event.created_at)}
        </time>
      </div>
    </div>
  );
}
