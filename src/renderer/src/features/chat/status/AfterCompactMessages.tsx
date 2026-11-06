import { Clock } from "lucide-react";
import type { QueuedMessage } from "@shared/types";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";

/**
 * 圧縮中に「いま」で送った指示（ChatLive の after_compact）。圧縮中の行の下に、送る前の吹き出しとして並べる。
 * 圧縮が終わるとコアがいまのやり取りに足し、自分の発言の記録になって圧縮の行の下に残る（作業ごと終わっていたら送信待ちの先頭へ）
 */
export function AfterCompactMessages({ messages }: { messages: QueuedMessage[] }) {
  return (
    <>
      {messages.map((m) => (
        <div key={m.id} className="user-message after-compact">
          <div className="bubble user">
            {m.attachments.length > 0 && (
              <div className="bubble-attachments">
                <AttachmentChips attachments={m.attachments} />
              </div>
            )}
            {m.text && <div className="bubble-text">{m.text}</div>}
          </div>
          <div className="message-meta">
            <Clock size={12} aria-hidden />
            圧縮が終わったら伝えます
          </div>
        </div>
      ))}
    </>
  );
}
