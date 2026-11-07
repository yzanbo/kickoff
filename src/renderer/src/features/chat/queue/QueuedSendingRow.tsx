import type { QueuedMessage } from "@shared/types";
import { relayOf } from "@shared/chat/prompts";
import { AttachmentPeek } from "@/features/chat/attachments/AttachmentPeek";

/**
 * 送った指示の「送信中」の行（いちばん上。useSendingQueued）。チャット欄（流れ）にその発言が出たら消える。
 * 操作は出さない（もう送った）。番号の代わりに回る印、文は行と同じ 1 行（つまみ・番号・文の列はほかの行にそろえる）
 */
export function QueuedSendingRow({
  message: m,
  withGrip,
}: {
  message: QueuedMessage;
  /** ほかの行につまみがあるか（あればその幅を空けて、番号と文の列をそろえる。書き直す欄と同じ） */
  withGrip: boolean;
}) {
  const relay = relayOf(m.text);
  const text = (relay ? relay.text : m.text) || m.attachments.map((a) => a.name).join("、");
  return (
    <div className="queued-row queued-sending" aria-label={`送信中: ${text}`}>
      {withGrip && <span className="queued-grip queued-grip-space" aria-hidden />}
      <span className="queued-index" aria-hidden>
        <span className="spinner" />
      </span>
      <AttachmentPeek attachments={m.attachments} />
      <span className="queued-text" title={text}>
        {text}
      </span>
      <span className="queued-sending-label">送信中…</span>
    </div>
  );
}
