import { ArrowDown, ArrowUp, Check, ChevronRight, FileText, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { api, attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";
import { cx } from "../../cx";
import { reportFailure } from "../../runActions";
import { IconButton } from "../IconButton";
import { useStoredFlag } from "../../hooks/useStoredState";
import { QUEUE_COLLAPSED_KEY } from "../../storageKeys";

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 見出しに実行中と送信待ちの数、行に添付（画像はサムネイル）を出す。
 * 見出しを押すとたたみ、「送信待ち n 件の追加があります」の 1 行だけにする（ためるほど縦に長くなるため。どのチャットでも同じに覚える）
 */
export function QueuedMessages({ runId, queue, busy }: { runId: number; queue: QueuedMessage[]; busy: boolean }) {
  const [collapsed, setCollapsed] = useStoredFlag(QUEUE_COLLAPSED_KEY);
  // 書き直している指示（id と書いている途中の文）
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  if (queue.length === 0) return null;
  const failed = reportFailure("待ちの指示を操作できませんでした");
  const summary = collapsed
    ? `${busy ? "実行中 1 件 · " : ""}送信待ち ${queue.length} 件の追加があります`
    : busy
      ? `実行中 1 件 · 送信待ち ${queue.length} 件（いまの作業が終わったら順に送ります）`
      : `送信待ち ${queue.length} 件（自動で送れませんでした。「すぐ送る」で送ってください）`;
  return (
    <div className={cx("queued-messages", collapsed && "collapsed")} aria-label="送信待ちの指示">
      <button
        type="button"
        className="queued-head small muted"
        aria-expanded={!collapsed}
        title={collapsed ? "送信待ちの一覧を開く" : "送信待ちの一覧をたたむ"}
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronRight size={13} className="queued-chevron" aria-hidden />
        {summary}
      </button>
      {!collapsed && queue.map((m, i) => (
        editing?.id === m.id ? (
          <QueuedEditor
            key={m.id}
            text={editing.text}
            onChange={(text) => setEditing({ id: m.id, text })}
            onSave={() => void api.editQueued(runId, m.id, editing.text).then(() => setEditing(undefined), failed)}
            onCancel={() => setEditing(undefined)}
          />
        ) : (
        <div key={m.id} className="queued-row">
          <QueuedAttachments attachments={m.attachments} />
          <span className="queued-text" title={m.text} onDoubleClick={() => setEditing({ id: m.id, text: m.text })}>
            {m.text || m.attachments.map((a) => a.name).join("、")}
          </span>
          <IconButton icon={Pencil} label="書き直す" title="書き直す（ダブルクリックでも）" size={13} onClick={() => setEditing({ id: m.id, text: m.text })} />
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
        )
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

/** 待ちの指示を書き直す欄（Enter で保存・Shift+Enter で改行・Esc でやめる） */
function QueuedEditor({ text, onChange, onSave, onCancel }: { text: string; onChange: (text: string) => void; onSave: () => void; onCancel: () => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      onSave();
    }
  };
  return (
    <div className="queued-row editing">
      <textarea
        className="queued-editor"
        value={text}
        rows={Math.min(6, Math.max(1, text.split("\n").length))}
        autoFocus
        aria-label="待ちの指示を書き直す"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <IconButton icon={Check} label="保存" title="保存（Enter）" size={13} onClick={onSave} />
      <IconButton icon={X} label="やめる" title="やめる（Esc）" size={13} onClick={onCancel} />
    </div>
  );
}
