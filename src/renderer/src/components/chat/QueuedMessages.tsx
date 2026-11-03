import { ArrowDown, ArrowUp, Check, ChevronRight, FileText, GripVertical, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { api, attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";
import { confirmDialog } from "../../dialogs";
import { cx } from "../../cx";
import { reportFailure } from "../../runActions";
import { IconButton } from "../IconButton";
import { useStoredFlag } from "../../hooks/useStoredState";
import { QUEUE_COLLAPSED_KEY } from "../../storageKeys";

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 見出しに実行中と送信待ちの数、行に添付（画像はサムネイル）を出す。
 * 行はドラッグでも並べ替えられる（↑↓ のボタンと同じ）。見出しの右の「まとめて送る」は、すべてを 1 つにまとめてすぐ送り、ごみ箱はすべて消す（確かめてから）。
 * 見出しを押すとたたみ、「送信待ち n 件の追加があります」の 1 行だけにする（ためるほど縦に長くなるため。どのチャットでも同じに覚える）
 */
export function QueuedMessages({ runId, queue, busy }: { runId: number; queue: QueuedMessage[]; busy: boolean }) {
  const [collapsed, setCollapsed] = useStoredFlag(QUEUE_COLLAPSED_KEY);
  // 書き直している指示（id と書いている途中の文）
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  // ドラッグで並べ替えている指示（from: 元の位置）と、入れる位置（at: 0〜件数。その位置の行の前に入れる）
  const [drag, setDrag] = useState<{ id: string; from: number; at?: number }>();
  /** ドラッグ中の行の上: 行の上半分なら前、下半分なら後ろに入れる位置にする */
  const dragOver = (e: DragEvent<HTMLDivElement>, i: number) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    if (at !== drag.at) setDrag({ ...drag, at });
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (drag?.at !== undefined) {
      // 移したあとの位置（元の位置より後ろへ入れるときは、自分が抜けた分だけ 1 つ前になる）
      const index = drag.at > drag.from ? drag.at - 1 : drag.at;
      if (index !== drag.from) void api.moveQueued(runId, drag.id, index).catch(failed);
    }
    setDrag(undefined);
  };
  if (queue.length === 0) return null;
  const failed = reportFailure("待ちの指示を操作できませんでした");
  const summary = collapsed
    ? `${busy ? "実行中 1 件 · " : ""}送信待ち ${queue.length} 件の追加があります`
    : busy
      ? `実行中 1 件 · 送信待ち ${queue.length} 件（いまの作業が終わったら順に送ります）`
      : `送信待ち ${queue.length} 件（自動で送れませんでした。「すぐ送る」で送ってください）`;
  return (
    <div className={cx("queued-messages", collapsed && "collapsed")} aria-label="送信待ちの指示">
      <div className="queued-head-row">
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
        <button
          type="button"
          className="btn btn-sm btn-primary queued-head-btn"
          title={`送信待ちの ${queue.length} 件を 1 つにまとめて、すぐ送る${busy ? "（いまの作業を止めてから送る）" : ""}`}
          onClick={() => void api.sendAllQueued(runId).catch(failed)}
        >
          <SendHorizontal size={12} aria-hidden />
          まとめて送る
        </button>
        <button
          type="button"
          className="btn btn-sm queued-head-btn queued-clear"
          title={`送信待ちの ${queue.length} 件をすべて消す（確かめてから）`}
          onClick={() =>
            void confirmDialog({
              title: `送信待ちの ${queue.length} 件をすべて消しますか？`,
              message: "消した指示は送られません。元に戻せません。",
              confirmLabel: "すべて消す",
              danger: true,
            }).then(async (ok) => {
              if (ok) await api.clearQueued(runId).catch(failed);
            })
          }
        >
          <Trash2 size={12} aria-hidden />
          すべて消す
        </button>
      </div>
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
        <div
          key={m.id}
          className={cx(
            "queued-row",
            drag?.id === m.id && "dragging",
            drag && drag.at === i && drag.from !== i && drag.from !== i - 1 && "drop-before",
            drag && drag.at === i + 1 && i === queue.length - 1 && drag.from !== i && "drop-after",
          )}
          draggable={queue.length > 1}
          title={queue.length > 1 ? "ドラッグで並べ替え" : undefined}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", m.text);
            setDrag({ id: m.id, from: i });
          }}
          onDragOver={(e) => dragOver(e, i)}
          onDrop={drop}
          onDragEnd={() => setDrag(undefined)}
        >
          {queue.length > 1 && <GripVertical size={13} className="queued-grip" aria-hidden />}
          {/* 送る順番（1 が次に送るもの） */}
          <span className="queued-index" aria-label={`${i + 1} 番目`}>
            {i + 1}
          </span>
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
