import { Clock } from "lucide-react";
import type { QueuedMessage } from "@shared/types";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";
import { cx } from "@/lib/cx";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";

/**
 * 圧縮が終わるのを待っている指示（ChatLive の after_compact）。圧縮中の行の下に、送る前の吹き出しとして、送る順に並べる。
 * 圧縮後指示があれば、いちばん上に「圧縮後指示」の札を付けた吹き出しを出し（コアが圧縮の記録を受け取るまでは pendingPost の文で先に見せる）、
 * 圧縮中・圧縮前指示の作業中に「いま」で送った指示は、その下に「圧縮後指示のあとに伝えます」と添える（コアは必ず圧縮後指示のあとに伝える）。
 * 圧縮が終わるとコアがいまのやり取りに足し、自分の発言の記録になって圧縮の行の下に残る（作業ごと終わっていたら送信待ちの先頭へ）
 */
export function AfterCompactMessages({ messages, pendingPost }: { messages: QueuedMessage[]; pendingPost: string | null }) {
  const pending = pendingPost === null ? [] : [{ id: "post-compact-pending", text: pendingPost, attachments: [], post_compact: true }];
  const items = [...pending, ...messages];
  const hasPost = items.some((m) => m.post_compact);
  return (
    <>
      {items.map((m) => (
        <div key={m.id} className={cx("user-message", "after-compact", m.post_compact && "compact-prompt post-compact")}>
          <div className="bubble user">
            {m.post_compact && <CompactPromptMark kind="post" className="message-kind-label" />}
            {m.attachments.length > 0 && (
              <div className="bubble-attachments">
                <AttachmentChips attachments={m.attachments} />
              </div>
            )}
            {m.text && <div className="bubble-text">{m.text}</div>}
          </div>
          <div className="message-meta">
            <Clock size={12} aria-hidden />
            {m.post_compact ? "圧縮が終わったら、最初に送ります" : hasPost ? "圧縮後指示のあとに伝えます" : "圧縮が終わったら伝えます"}
          </div>
        </div>
      ))}
    </>
  );
}
