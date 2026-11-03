import { ArrowDown, ArrowUp, Paperclip, SendHorizontal, Trash2 } from "lucide-react";
import type { QueuedMessage } from "../../../../core/types";
import { api } from "../../api";
import { reportFailure } from "../../runActions";
import { IconButton } from "../IconButton";

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 中断・失敗で止まったときは列に残すので、送るかどうかを選ぶ
 */
export function QueuedMessages({ runId, queue, busy }: { runId: number; queue: QueuedMessage[]; busy: boolean }) {
  if (queue.length === 0) return null;
  const failed = reportFailure("待ちの指示を操作できませんでした");
  return (
    <div className="queued-messages" aria-label="送信待ちの指示">
      <div className="queued-head small muted">
        送信待ち {queue.length} 件{busy ? "（いまの作業が終わったら順に送ります）" : "（止まっているので、まだ送っていません）"}
      </div>
      {queue.map((m, i) => (
        <div key={m.id} className="queued-row">
          <span className="queued-text" title={m.text}>
            {m.attachments.length > 0 && <Paperclip size={12} className="muted queued-attach" aria-label={`添付 ${m.attachments.length} 件`} />}
            {m.text || m.attachments.map((a) => a.name).join("、")}
          </span>
          <IconButton icon={ArrowUp} label="上へ" size={13} disabled={i === 0} onClick={() => void api.moveQueued(runId, m.id, i - 1).catch(failed)} />
          <IconButton
            icon={ArrowDown}
            label="下へ"
            size={13}
            disabled={i === queue.length - 1}
            onClick={() => void api.moveQueued(runId, m.id, i + 1).catch(failed)}
          />
          <IconButton
            icon={SendHorizontal}
            label={busy ? "いまの作業を止めて、すぐ送る" : "すぐ送る"}
            size={13}
            onClick={() => void api.sendQueuedNow(runId, m.id).catch(failed)}
          />
          <IconButton icon={Trash2} label="待ちの列から消す" size={13} onClick={() => void api.removeQueued(runId, m.id).catch(failed)} />
        </div>
      ))}
    </div>
  );
}
