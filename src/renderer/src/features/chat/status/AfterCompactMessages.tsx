import { Clock, CornerUpLeft, Trash2 } from "lucide-react";
import type { QueuedMessage } from "@shared/types";
import { api } from "@/api";
import { IconButton } from "@/ui/IconButton";
import { reportFailure } from "@/ui/dialogs";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";
import { cx } from "@/lib/cx";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";

/** コアが預かりに入れる前に、圧縮後指示を先に見せる吹き出しの ID（まだ消せない） */
const PENDING_POST_ID = "post-compact-pending";

/**
 * 圧縮が終わるのを待っている指示（ChatLive の after_compact）。圧縮中の行の下に、送る前の吹き出しとして、送る順に並べる。
 * 圧縮後指示があれば、いちばん上に「圧縮後指示」の札を付けた吹き出しを出し（コアが圧縮の記録を受け取るまでは pendingPost の文で先に見せる）、
 * 圧縮中・圧縮前指示の作業中に「いま」で送った指示は、その下に「圧縮後指示のあとに伝えます」と添える（コアは必ず圧縮後指示のあとに伝える）。
 * 圧縮が終わるとコアがいまのやり取りに足し、自分の発言の記録になって圧縮の行の下に残る（作業ごと終わっていたら送信待ちの先頭へ）。
 * 圧縮を待っていないのに残っている圧縮後指示（通信の切断などで作業ごと終わった・前の版で送信待ちに入っていたもの）は、
 * 作業中ならいまの作業に、作業していなければ次に送った指示の作業にそのまま伝わるので、そう添える（until）。
 * 伝える前なら、吹き出しの下のボタンで送らずに消せる（圧縮中に誤って送ったとき）。「入力欄に戻す」は消して、文と添付を入力欄の後ろに足す（直して送り直せる）
 */
export function AfterCompactMessages({ messages, pendingPost, until }: { messages: QueuedMessage[]; pendingPost: string | null; until: "compact" | "turn" | "next" }) {
  const pending: QueuedMessage[] = pendingPost === null ? [] : [{ id: PENDING_POST_ID, text: pendingPost, options: {}, attachments: [], created_at: "", post_compact: true }];
  const items = [...pending, ...messages];
  const hasPost = items.some((m) => m.post_compact);
  const pane = useOptionalChatPane();
  /** 送らずに外す（入力欄に戻すなら、外した文と添付を入力欄の後ろに足す） */
  const remove = (m: QueuedMessage, back: boolean) => {
    if (!pane) return;
    void api
      .removeAfterCompact(pane.chatId, m.id)
      .then((removed) => back && pane.fillComposer(removed.text, { append: true, attachments: removed.attachments }))
      .catch(reportFailure("指示を取り消せませんでした"));
  };
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
            {until === "next" ? "次に送る指示と一緒に伝えます" : until === "turn" ? "いまの作業に伝えます" : m.post_compact ? "圧縮が終わったら、最初に送ります" : hasPost ? "圧縮後指示のあとに伝えます" : "圧縮が終わったら伝えます"}
            {/* 伝える前なら送らずに消せる（コアが預かりに入れる前に先に見せている圧縮後指示は、まだ消せない） */}
            {pane && m.id !== PENDING_POST_ID && (
              <>
                {!m.post_compact && (
                  <IconButton
                    icon={CornerUpLeft}
                    size={13}
                    label="入力欄に戻す"
                    title="送らずに取り消して、文と添付を入力欄に戻す（直して送り直せます）"
                    className="message-action"
                    onClick={() => remove(m, true)}
                  />
                )}
                <IconButton
                  icon={Trash2}
                  size={13}
                  label="送らずに消す"
                  title={m.post_compact ? "今回の圧縮では、圧縮後指示を送らない（設定の圧縮後指示はそのまま）" : "この指示を送らずに消す（圧縮中に誤って送ったとき）"}
                  className="message-action"
                  onClick={() => remove(m, false)}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
