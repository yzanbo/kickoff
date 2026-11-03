import { ArrowDownToLine, ArrowUpToLine, Pause, Play, SendHorizontal, Trash2, X } from "lucide-react";
import { cx } from "../../cx";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { IconButton } from "../IconButton";

/** 終わったら自動で送るか、送らずに止めておくか（いまの状態を出し、押すと切り替える。チャットごと） */
export function QueuedModeButton({ runId, paused, busy, failed }: { runId: number; paused: boolean; busy: boolean; failed: (e: unknown) => void }) {
  return (
    <button
      type="button"
      className={cx("btn btn-sm queued-head-btn queued-mode", paused && "paused")}
      aria-pressed={paused}
      aria-label={paused ? "止めています（押すと、自動で送るに戻す）" : "自動で送ります（押すと、送らずに止めておく）"}
      title={
        paused
          ? `いまの作業が終わっても送らずに止めておきます。行の「すぐ送る」で 1 件ずつ送れます。押すと、自動で送るに戻します${busy ? "" : "（先頭をすぐ送ります）"}`
          : "いまの作業が終わったら、先頭から順に自動で送ります。押すと、送らずに止めておきます（移動の前などに）"
      }
      onClick={() => void api.setQueuePaused(runId, !paused).catch(failed)}
    >
      {paused ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
      <span className="queued-head-label">{paused ? "止めています" : "自動で送る"}</span>
    </button>
  );
}

/**
 * 選んだ指示の並べ替え（いちばん上へ・いちばん下へ）。送る・消すとは意味が違うので、見出しの「自動で送る」のすぐ左に置く
 */
export function QueuedMoveActions({ runId, selected, failed }: { runId: number; selected: string[]; failed: (e: unknown) => void }) {
  const n = selected.length;
  return (
    <span className="queued-head-moves">
      <IconButton icon={ArrowUpToLine} size={13} label={`選んだ ${n} 件をいちばん上へ`} onClick={() => void api.moveQueuedMany(runId, selected, "top").catch(failed)} />
      <IconButton icon={ArrowDownToLine} size={13} label={`選んだ ${n} 件をいちばん下へ`} onClick={() => void api.moveQueuedMany(runId, selected, "bottom").catch(failed)} />
    </span>
  );
}

/**
 * 送信待ちの見出しの右の、全体・選んだものへの操作。
 * 選んでいなければ「すべて送る」（すべてを 1 つにまとめてすぐ送る）と「すべて消す」（2 件以上のときだけ。1 件なら行のボタンと同じになるため）、
 * 選んでいれば「まとめて送る」（選んだものだけを 1 つにまとめてすぐ送る）・消す・選ぶのをやめる（並べ替えは QueuedMoveActions）
 */
export function QueuedHeadActions({
  runId,
  count,
  selected,
  busy,
  onClearSelection,
  failed,
}: {
  runId: number;
  count: number;
  /** 選んでいる指示（列の順） */
  selected: string[];
  busy: boolean;
  onClearSelection: () => void;
  failed: (e: unknown) => void;
}) {
  // 作業中は止めずに、いまのやり取りに伝える（Runner の tell。メインのエージェントがいまの手順の切れ目で読む）
  const stopping = busy ? "（作業は止めずに、いまのやり取りに伝える）" : "";
  if (selected.length > 0) {
    const n = selected.length;
    const done = () => onClearSelection();
    return (
      <>
        <button
          type="button"
          className="btn btn-sm btn-primary queued-head-btn"
          aria-label={`選んだ ${n} 件をまとめて送る`}
          title={`選んだ ${n} 件を 1 つにまとめて、すぐ送る${stopping}`}
          onClick={() => void api.sendAllQueued(runId, selected).then(done, failed)}
        >
          <SendHorizontal size={12} aria-hidden />
          <span className="queued-head-label">まとめて送る</span>
        </button>
        <button
          type="button"
          className="btn btn-sm queued-head-btn queued-clear"
          aria-label={`選んだ ${n} 件を消す`}
          title={`選んだ ${n} 件を消す（確かめてから）`}
          onClick={() =>
            void confirmDialog({ title: `選んだ ${n} 件を消しますか？`, message: "消した指示は送られません。元に戻せません。", confirmLabel: "消す", danger: true }).then(
              async (ok) => {
                if (ok) await api.removeQueuedMany(runId, selected).then(done, failed);
              },
            )
          }
        >
          <Trash2 size={12} aria-hidden />
          <span className="queued-head-label">消す</span>
        </button>
        <IconButton icon={X} size={13} label="選ぶのをやめる" title="選ぶのをやめる（Esc）" onClick={onClearSelection} />
      </>
    );
  }
  if (count < 2) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-primary queued-head-btn"
        aria-label="すべて送る"
        title={`送信待ちの ${count} 件をすべて 1 つにまとめて、すぐ送る${stopping}。一部だけ送るときは、⌘ / Shift ＋クリックで選んでから「まとめて送る」`}
        onClick={() => void api.sendAllQueued(runId).catch(failed)}
      >
        <SendHorizontal size={12} aria-hidden />
        {/* 狭いときは文字を隠してアイコンだけにする（読み上げは aria-label） */}
        <span className="queued-head-label">すべて送る</span>
      </button>
      <button
        type="button"
        className="btn btn-sm queued-head-btn queued-clear"
        aria-label="すべて消す"
        title={`送信待ちの ${count} 件をすべて消す（確かめてから）`}
        onClick={() =>
          void confirmDialog({
            title: `送信待ちの ${count} 件をすべて消しますか？`,
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
  );
}
