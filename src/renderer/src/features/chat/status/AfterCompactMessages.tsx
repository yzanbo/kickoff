import { Clock, Pencil, Trash2 } from "lucide-react";
import type { QueuedMessage } from "@shared/types";
import { api } from "@/api";
import { IconButton } from "@/ui/IconButton";
import { reportFailure } from "@/ui/dialogs";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { AttachmentChips } from "@/features/chat/attachments/AttachmentChip";
import { cx } from "@/lib/cx";
import { CompactPromptMark } from "@/features/snippet/CompactPromptMark";
import { startHeldEdit, useHeldEdit } from "./heldEdit";

/** コアが預かりに入れる前に、圧縮後指示を先に見せる吹き出しの ID（まだ消せない） */
const PENDING_POST_ID = "post-compact-pending";

/**
 * 預かった指示をいつ送るか: compact = 圧縮が終わるのを待っている / exchange = 圧縮のあとのやり取り（圧縮後指示か、圧縮のあとの続き）の途中 /
 * turn = 圧縮を待たずに残っている（作業中。いまの作業に伝える）/ next = 作業していないのに残っている（次に送る指示と一緒に伝える）
 */
export type AfterCompactUntil = "compact" | "exchange" | "turn" | "next";

/** 吹き出しの下に添える、いつ送るかの文 */
function untilText(until: AfterCompactUntil, post: boolean, hasPost: boolean): string {
  if (until === "next") return "次に送る指示と一緒に伝えます";
  if (until === "turn" || (until === "exchange" && post)) return "いまの作業に伝えます";
  if (until === "exchange") return "このやり取りが終わったら送ります";
  if (post) return "圧縮が終わったら、最初に送ります";
  return hasPost ? "圧縮後指示のやり取りが終わったら送ります" : "圧縮のあとのやり取りが終わったら送ります";
}

/**
 * 圧縮が終わるのを待っている指示（ChatLive の after_compact）。圧縮中の行の下に、送る前の吹き出しとして、送る順に並べる。
 * 圧縮後指示があれば、いちばん上に「圧縮後指示」の札を付けた吹き出しを出し（コアが圧縮の記録を受け取るまでは pendingPost の文で先に見せる）、
 * 圧縮前指示から圧縮のあとのやり取りが終わるまでに「いま」で送った指示は、その下に「圧縮後指示（なければ圧縮のあと）のやり取りが終わったら送ります」と添える。
 * 圧縮が終わると、圧縮後指示はコアがいまのやり取りに足して自分の発言の記録になり、預かった指示はそのやり取り（until = exchange）が終わってから
 * 送る（1 つ目を新しい作業として送り、残りはその作業に伝える）。それまでは作業中の行の下（圧縮後指示の発言・圧縮の行より後ろ）に出し続ける。
 * 圧縮を待っていないのに残っている圧縮後指示（通信の切断などで作業ごと終わった・前の版で送信待ちに入っていたもの）は、
 * 作業中ならいまの作業に、作業していなければ次に送った指示の作業にそのまま伝わるので、そう添える（until）。
 * 伝える前なら、吹き出しの下のボタンで送らずに消せる（圧縮中に誤って送ったとき）。鉛筆（ふつうの発言の書き直しと同じアイコン）で、チャット欄を書き直しの欄に
 * 入れ替えて直せる（HeldEditComposer。保存しても送る順は変えない。前は「入力欄に戻す」で消してから入力欄に入れていたので、送り直すと最後に回り、順番が入れ替わった）
 */
export function AfterCompactMessages({ messages, pendingPost, until }: { messages: QueuedMessage[]; pendingPost: string | null; until: AfterCompactUntil }) {
  const pending: QueuedMessage[] = pendingPost === null ? [] : [{ id: PENDING_POST_ID, text: pendingPost, options: {}, attachments: [], created_at: "", post_compact: true }];
  const items = [...pending, ...messages];
  const hasPost = items.some((m) => m.post_compact);
  const pane = useOptionalChatPane();
  // 入力欄で書き直している指示（あれば、その吹き出しに印を付け、ほかの鉛筆は押せなくする）
  const editing = useHeldEdit(pane?.chatId ?? -1);
  /** 送らずに外す */
  const remove = (m: QueuedMessage) => {
    if (!pane) return;
    void api.removeAfterCompact(pane.chatId, m.id).catch(reportFailure("指示を取り消せませんでした"));
  };
  return (
    <>
      {items.map((m, i) => (
        <div key={m.id} className={cx("user-message", "after-compact", m.post_compact && "compact-prompt post-compact", editing?.id === m.id && "held-editing")}>
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
            {editing?.id === m.id ? <Pencil size={12} aria-hidden /> : <Clock size={12} aria-hidden />}
            {editing?.id === m.id ? "チャット欄で書き直しています（保存しても、この順番のまま送ります）" : untilText(until, m.post_compact === true, hasPost)}
            {/* 伝える前なら送らずに消せる（コアが預かりに入れる前に先に見せている圧縮後指示は、まだ消せない） */}
            {pane && m.id !== PENDING_POST_ID && (
              <>
                {!m.post_compact && editing?.id !== m.id && (
                  <IconButton
                    icon={Pencil}
                    size={13}
                    label="書き直す"
                    title={editing ? "ほかの指示を書き直しています（保存するか、やめてから）" : "チャット欄で書き直す（画像の添付・定型文も使えます。保存しても送る順はそのまま。書き直している間は送らずに待ちます）"}
                    className="message-action"
                    disabled={editing !== null}
                    onClick={() => startHeldEdit(pane.chatId, { id: m.id, position: i + 1, text: m.text, attachments: m.attachments })}
                  />
                )}
                <IconButton
                  icon={Trash2}
                  size={13}
                  label="送らずに消す"
                  title={m.post_compact ? "今回の圧縮では、圧縮後指示を送らない（設定の圧縮後指示はそのまま）" : "この指示を送らずに消す（圧縮中に誤って送ったとき）"}
                  className="message-action"
                  onClick={() => remove(m)}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
