import "./AnswerBubble.css";
import type { ReactNode } from "react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { formatFullDateTime, formatMessageTime } from "@/foundation/ui/lib/time";
import { cx } from "@/foundation/ui/lib/cx";

/**
 * 承認・質問のカードで答えた内容の吹き出し（「質問への回答」・「拒否の理由」で共通）: 自分の発言と同じ吹き出しで右に出し、
 * 上に札（icon と label）を添えて、ふつうの指示と見分けられるようにする。下に答えた時刻。
 * quoteText: 選ばずに右クリックしたときに丸ごと「チャットに追加」・コピーする文（useQuoteMenu。quoteNoun はその呼び名）
 */
export function AnswerBubble({
  event,
  className,
  icon,
  label,
  quoteText,
  quoteNoun,
  children,
}: {
  event: ChatEventOf<"approval_resolved">;
  className: string;
  icon: ReactNode;
  label: string;
  quoteText: string;
  quoteNoun: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("user-message answer-bubble", className)}>
      <div className="bubble user" id={`ev-${event.id}`} data-quote-text={quoteText} data-quote-noun={quoteNoun}>
        <div className="message-kind-label">
          {icon}
          {label}
        </div>
        {children}
      </div>
      <div className="message-meta">
        <time dateTime={event.created_at} title={formatFullDateTime(event.created_at)}>
          {formatMessageTime(event.created_at)}
        </time>
      </div>
    </div>
  );
}
