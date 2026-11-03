import { ChevronRight, SendHorizontal, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { QueuedMessage } from "../../../../core/types";
import { api } from "../../api";
import { QueuedEditor, QueuedRow } from "./QueuedRow";
import { confirmDialog } from "../../dialogs";
import { cx } from "../../cx";
import { reportFailure } from "../../runActions";
import { useStoredFlag } from "../../hooks/useStoredState";
import { QUEUE_COLLAPSED_KEY } from "../../storageKeys";

/**
 * 作業中に送った次の指示の待ちの列（チャット欄のすぐ上）。
 * いまの作業が終わったら（止めた・失敗したときも）先頭から順に送る。並べ替え・消す・すぐ送る（作業中なら止めてから送る）ができる。
 * 見出しに送信待ちの数、行に添付（1 つ目のサムネイルと、ほかの数）を出す。5 件ほどを超えたら一覧の中でスクロールし、狭い欄では ↑↓ とボタンの文字を隠す（右クリックのメニューに同じ操作がある）。
 * 行は左のつまみのドラッグでも並べ替えられる（↑↓ のボタンと同じ。文は選んでコピーできる）。行のダブルクリックで書き直す。見出しの右の「n 件をまとめて送る」は、すべてを 1 つにまとめてすぐ送り、「n 件すべて消す」はすべて消す（確かめてから）。どちらも 2 件以上のときだけ出す。
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
  // 見出し: 件数と、短い案内（実行中はいつも 1 件なので数えない。件数は見出しだけに出し、ボタンでくり返さない）
  const hint = !busy ? "自動で送れませんでした。行の「すぐ送る」で送れます" : collapsed ? "" : "終わったら順に送ります";
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
          <span className="queued-count">送信待ち {queue.length} 件</span>
          {hint && <span className="queued-hint">{hint}</span>}
        </button>
        {/* 全体への操作は 2 件以上のときだけ（1 件のときは行の「すぐ送る」「消す」と同じで、その 1 件へのボタンに見えるため） */}
        {queue.length > 1 && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary queued-head-btn"
              aria-label="まとめて送る"
              title={`送信待ちの ${queue.length} 件を 1 つにまとめて、すぐ送る${busy ? "（いまの作業を止めてから送る）" : ""}`}
              onClick={() => void api.sendAllQueued(runId).catch(failed)}
            >
              <SendHorizontal size={12} aria-hidden />
              {/* 狭いときは文字を隠してアイコンだけにする（読み上げは aria-label） */}
              <span className="queued-head-label">まとめて送る</span>
            </button>
            <button
              type="button"
              className="btn btn-sm queued-head-btn queued-clear"
              aria-label="すべて消す"
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
              <span className="queued-head-label">すべて消す</span>
            </button>
          </>
        )}
      </div>
      {/* 増えてもチャット欄を押し上げすぎないよう、5 件ほどの高さを超えたら中でスクロールする */}
      {!collapsed && (
        <div className="queued-list">
          {queue.map((m, i) =>
            editing?.id === m.id ? (
              <QueuedEditor
                key={m.id}
                index={i}
                withGrip={queue.length > 1}
                attachments={m.attachments}
                text={editing.text}
                onChange={(text) => setEditing({ id: m.id, text })}
                onSave={() => void api.editQueued(runId, m.id, editing.text).then(() => setEditing(undefined), failed)}
                onCancel={() => setEditing(undefined)}
              />
            ) : (
              <QueuedRow
                key={m.id}
                message={m}
                index={i}
                count={queue.length}
                busy={busy}
                className={cx(
                  "queued-row",
                  drag?.id === m.id && "dragging",
                  drag && drag.at === i && drag.from !== i && drag.from !== i - 1 && "drop-before",
                  drag && drag.at === i + 1 && i === queue.length - 1 && drag.from !== i && "drop-after",
                )}
                actions={{
                  edit: () => setEditing({ id: m.id, text: m.text }),
                  move: (to) => void api.moveQueued(runId, m.id, to).catch(failed),
                  sendNow: () => void api.sendQueuedNow(runId, m.id).catch(failed),
                  remove: () => void api.removeQueued(runId, m.id).catch(failed),
                }}
                onDragStart={() => setDrag({ id: m.id, from: i })}
                onDragEnd={() => setDrag(undefined)}
                onDragOver={(e) => dragOver(e, i)}
                onDrop={drop}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
