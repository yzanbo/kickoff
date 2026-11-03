import { ArrowDown, ArrowUp, FileText, SendHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { api, attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";
import { reportFailure } from "../../runActions";
import { IconButton } from "../IconButton";

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 見出しに実行中と送信待ちの数、行に添付（画像はサムネイル）を出す
 */
export function QueuedMessages({ runId, queue, busy }: { runId: number; queue: QueuedMessage[]; busy: boolean }) {
  if (queue.length === 0) return null;
  const failed = reportFailure("待ちの指示を操作できませんでした");
  return (
    <div className="queued-messages" aria-label="送信待ちの指示">
      <div className="queued-head small muted">
        {busy ? `実行中 1 件 · 送信待ち ${queue.length} 件（いまの作業が終わったら順に送ります）` : `送信待ち ${queue.length} 件（自動で送れませんでした。「すぐ送る」で送ってください）`}
      </div>
      {queue.map((m, i) => (
        <div key={m.id} className="queued-row">
          <QueuedAttachments attachments={m.attachments} />
          <span className="queued-text" title={m.text}>
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

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/;

/** 待ちの指示の添付（画像は小さなサムネイルで、押すと大きく表示。それ以外はファイルの印と名前） */
function QueuedAttachments({ attachments }: { attachments: Attachment[] }) {
  const [viewing, setViewing] = useState<Attachment>();
  if (attachments.length === 0) return null;
  return (
    <span className="queued-attachments">
      {attachments.map((a) =>
        PREVIEWABLE.test(a.mime) ? (
          <button key={a.id} type="button" className="queued-thumb" title={`${a.name}（大きく表示）`} aria-label={`${a.name} を大きく表示`} onClick={() => setViewing(a)}>
            <img src={attachmentUrl(a)} alt="" />
          </button>
        ) : (
          <span key={a.id} className="queued-file" title={a.name}>
            <FileText size={12} aria-hidden />
            {a.name}
          </span>
        ),
      )}
      {viewing && <ImageViewer src={attachmentUrl(viewing)} name={viewing.name} onClose={() => setViewing(undefined)} />}
    </span>
  );
}
