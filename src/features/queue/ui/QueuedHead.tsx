import { ChevronRight, ChevronsDownUp, ChevronsUpDown, OctagonPause, SendHorizontal } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { useQueueActions } from "./queueContext";
import { collapsedNext } from "./queuedListModel";
import { isStopHint, queuedHint } from "./queuedHint";
import { QueueHeadButton } from "./QueueHeadButton";
import { QueuedHeadTools } from "./QueuedHeadActions";
import { QueuedSelectionActions } from "./QueuedSelectionActions";

/**
 * 送信待ちの見出しの行: 件数・案内・畳んだときの「次:」（押すと開く・たたむ）、溜まったときの「すべて表示 / 縮める」、右の操作
 * （選んでいるときは選んだものへの操作に入れ替える。畳んでいる間はしまう）。見出しの行にドラッグして落とすと、いちばん上へ（1 件目の上の一時停止よりも上）
 */
export function QueuedHead({
  busy,
  collapsed,
  onToggle,
  expanded,
  onExpand,
  overflowing,
  sending,
  readyForEdit,
  held,
}: {
  busy: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** 中でスクロールさせずにすべて出しているか・切り替え（溜まって中でスクロールするようになったときだけ出す） */
  expanded: boolean;
  onExpand: () => void;
  overflowing: boolean;
  /** 送った指示で、まだチャット欄に出ていない数（畳んでいても送信中と分かるようにする） */
  sending: number;
  /** 次に送る指示を書き直していて、送信の準備ができている（案内は見出しに 1 か所だけ） */
  readyForEdit: boolean;
  /** 起動したときの再開の確かめで送信待ちを聞いている */
  held: boolean;
}) {
  const { view, dnd, selection } = useQueueActions();
  const count = view.messages.length;
  const hint = queuedHint(view, { busy, collapsed, readyForEdit, held });
  // 止める印と同じ色・同じアイコンで、畳んでいてもひと目で分かるようにする
  const stopHint = isStopHint(view, { busy, readyForEdit, held });
  // 畳んだ 1 行には、次に送る指示の初めの行も出す（中を開かなくても、次に何が送られるか分かる）
  const next = collapsedNext(collapsed, view.messages);
  const picked = selection.selected.length;
  return (
    <div className="queued-head-row" onDragOver={dnd.overTop} onDrop={dnd.drop}>
      <div className="queued-head-main">
        <button
          type="button"
          className="queued-head small muted"
          aria-expanded={!collapsed}
          title={`${collapsed ? "送信待ちの一覧を開く" : "送信待ちの一覧をたたむ"}${hint ? `（${hint}）` : ""}`}
          onClick={onToggle}
        >
          <ChevronRight size={13} className="queued-chevron" aria-hidden />
          <span className="queued-count">送信待ち {count} 件</span>
          {collapsed && sending > 0 && <span className="queued-sending-label">送信中…</span>}
          {picked > 0 ? (
            <span className="queued-hint">{picked} 件を選択中</span>
          ) : (
            hint && (
              <span className={cx("queued-hint", stopHint && "stop", readyForEdit && "ready")}>
                {stopHint && <OctagonPause size={12} aria-hidden />}
                {readyForEdit && <SendHorizontal size={12} aria-hidden />}
                {hint}
              </span>
            )
          )}
          {next && <span className="queued-next">次: {next}</span>}
        </button>
        {/* 一覧の見え方の操作なので、送る・消すの並びと分けて件数の隣に置く */}
        {!collapsed && (overflowing || expanded) && (
          <QueueHeadButton
            icon={expanded ? ChevronsDownUp : ChevronsUpDown}
            label={expanded ? "縮める" : "すべて表示"}
            aria-label={expanded ? "縮めて表示" : "すべて表示"}
            aria-expanded={expanded}
            title={expanded ? "決めた高さに縮め、中でスクロールさせる" : `送信待ちの ${count} 件をすべて表示する（中でスクロールさせない）`}
            onClick={onExpand}
          />
        )}
      </div>
      {!collapsed && (picked > 0 ? <QueuedSelectionActions busy={busy} /> : <QueuedHeadTools busy={busy} />)}
    </div>
  );
}
