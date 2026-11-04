import { ArrowDownToLine, ArrowUpToLine, Merge, OctagonPause, Pause, Pencil, Play, SendHorizontal, Trash2, X } from "lucide-react";
import { cx } from "../../cx";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { IconButton } from "../IconButton";
import { SendAllMenu } from "./SendAllMenu";

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
 * 「一時停止」（自動で送るのを一度止める位置。以前の一時停止の印）を、いちばん上（1 件目の上 = 位置 0）に挟む。
 * 名前は、押した結果（「今の分で止める」など）ではなく、列に挟む物の名前で呼ぶ。置いたあとは、線のつまみのドラッグ・↑↓ で止める位置へ動かす。
 * もう 1 件目の上に印があれば押せない。onAdded は置いたあと（たたんでいれば一覧を開いて線を見せる）
 */
export function QueuedStopButton({ runId, stops, failed, onAdded }: { runId: number; stops: number[]; failed: (e: unknown) => void; onAdded: () => void }) {
  const atTop = stops.includes(0);
  return (
    <button
      type="button"
      className="btn btn-sm queued-head-btn queued-add-stop"
      disabled={atTop}
      aria-label="一時停止をいちばん上に挟む"
      title={
        atTop
          ? "1 件目の上にもう一時停止があります（線をドラッグ・↑↓ で動かせます）"
          : "自動で送るのを一度止める位置（一時停止）を、列のいちばん上に挟みます。線をドラッグ・↑↓ で、止めたい位置へ動かせます"
      }
      onClick={() => void api.setQueueStops(runId, [0, ...stops]).then(onAdded, failed)}
    >
      <OctagonPause size={12} aria-hidden />
      <span className="queued-head-label">一時停止</span>
    </button>
  );
}

/**
 * 選んだ指示の並べ替え（いちばん上へ・いちばん下へ）。行の ↑↓ と同じく、送る・消すのまとまりの左に区切って置く
 */
export function QueuedMoveActions({ runId, selected, failed }: { runId: number; selected: string[]; failed: (e: unknown) => void }) {
  const n = selected.length;
  return (
    <span className="queued-head-moves">
      <IconButton icon={ArrowUpToLine} size={13} label={`選んだ ${n} 件をいちばん上へ移動`} onClick={() => void api.moveQueuedMany(runId, selected, "top").catch(failed)} />
      <IconButton icon={ArrowDownToLine} size={13} label={`選んだ ${n} 件をいちばん下へ移動`} onClick={() => void api.moveQueuedMany(runId, selected, "bottom").catch(failed)} />
    </span>
  );
}

/**
 * 送信待ちの見出しの右の、全体・選んだものへの操作。
 * 選んでいなければ「すべて送る」（すべてを 1 つにまとめてすぐ送る）と「すべて消す」（2 件以上のときだけ。1 件なら行のボタンと同じになるため）、
 * 選んでいれば「書き直す」（選んだ指示の書き直す欄をまとめて開く）・「まとめて送る」（選んだものだけを 1 つにまとめてすぐ送る）・消す・選ぶのをやめる（並べ替えは QueuedMoveActions）
 */
export function QueuedHeadActions({
  runId,
  count,
  selected,
  busy,
  holds,
  onClearSelection,
  onEditSelected,
  failed,
}: {
  runId: number;
  count: number;
  /** 止めている・一時停止の印がある */
  holds: boolean;
  /** 選んでいる指示（列の順） */
  selected: string[];
  busy: boolean;
  onClearSelection: () => void;
  /** 選んだ指示の書き直す欄をまとめて開く（いくつでも同時に書き直せる） */
  onEditSelected: () => void;
  failed: (e: unknown) => void;
}) {
  // 作業中は止めずに、いまのやり取りに伝える（Runner の tell。メインのエージェントがいまの手順の切れ目で読む）
  const stopping = busy ? "（作業は止めずに、いまのやり取りに足す）" : "";
  if (selected.length > 0) {
    const n = selected.length;
    const done = () => onClearSelection();
    return (
      <>
        <button
          type="button"
          className="btn btn-sm queued-head-btn"
          aria-label={`選んだ ${n} 件を書き直す`}
          title={`選んだ ${n} 件の書き直す欄をまとめて開く（1 件ずつ保存・やめるができる）`}
          onClick={onEditSelected}
        >
          <Pencil size={12} aria-hidden />
          <span className="queued-head-label">書き直す</span>
        </button>
        {/* 送らずに、選んだ指示を 1 件にまとめる（列の順に空行でつなぐ。選んだうちのいちばん上の位置に残る） */}
        {n > 1 && (
          <button
            type="button"
            className="btn btn-sm queued-head-btn"
            aria-label={`選んだ ${n} 件を 1 つにまとめる`}
            title={`選んだ ${n} 件を、送らずに 1 つの指示にまとめる（列の順に空行でつなぎ、添付も合わせる。選んだうちのいちばん上の位置に残る）`}
            onClick={() => void api.mergeQueued(runId, selected).then(done, failed)}
          >
            <Merge size={12} aria-hidden />
            <span className="queued-head-label">1 つにまとめる</span>
          </button>
        )}
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
      {/* 押すと、まとめて 1 件で送るか・1 件ずつ順に送るかを選ぶ */}
      <SendAllMenu runId={runId} count={count} busy={busy} holds={holds} failed={failed} />
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
