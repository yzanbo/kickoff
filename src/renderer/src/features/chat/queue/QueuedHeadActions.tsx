import { OctagonPause, Pause, Play, Plus, Trash2 } from "lucide-react";
import { QUEUE_ACTIONS, type QueueAction } from "@shared/types";
import { cx } from "@/lib/cx";
import { api } from "@/api";
import { confirmDialog } from "@/ui/dialogs";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { queueFailed as failed } from "./queueFailed";
import { QUEUE_ACTION_LOOKS } from "./queueActionLooks";
import { SendAllMenu } from "./SendAllMenu";

/**
 * 送信待ちの見出しの右の操作（選んでいないとき。選んでいるときは QueuedSelectionActions と入れ替える）。
 * 何に効くかで 3 つのまとまりに分ける（まとまりの中は折り返さず、狭ければまとまりごと次の行へ回る）:
 * - 挟む: 列に行（線）を 1 つ足す物（一時停止・会話の圧縮・コンテキストの消去）。足したあとはドラッグ・↑↓ で位置を決める
 * - 送り方: 終わったら自動で送るか（列全体の設定）と、いますべて送る
 * - すべて消す（取り消せないので、ほかと離していちばん右に）
 * すべて送る・すべて消すは 2 件以上のときだけ（1 件なら行のボタンと同じになるため）。onAdded は挟んだあと（たたんでいれば一覧を開いて見せる）
 */
export function QueuedHeadTools({
  count,
  busy,
  paused,
  stops,
  onAdded,
}: {
  count: number;
  busy: boolean;
  paused: boolean;
  stops: number[];
  onAdded: () => void;
}) {
  return (
    <div className="queued-head-tools">
      <span className="queued-head-group" role="group" aria-label="列に挟む">
        <span className="queued-head-group-label" aria-hidden title="押すと列に 1 行足します。足した行はドラッグ・↑↓ で位置を決めます">
          <Plus size={11} />
          挟む
        </span>
        <QueuedStopButton stops={stops} onAdded={onAdded} />
        {QUEUE_ACTIONS.map((a) => (
          <QueuedActionButton key={a} action={a} onAdded={onAdded} />
        ))}
      </span>
      <span className="queued-head-group queued-head-send" role="group" aria-label="送り方">
        <QueuedModeButton paused={paused} busy={busy} />
        {/* 押すと、まとめて 1 件で送るか・1 件ずつ順に送るかを選ぶ */}
        {count > 1 && <SendAllMenu count={count} busy={busy} holds={paused || stops.length > 0} />}
      </span>
      {count > 1 && <QueuedRemoveAllButton count={count} />}
    </div>
  );
}

/** 終わったら自動で送るか、送らずに止めておくか（いまの状態を出し、押すと切り替える。チャットごと） */
function QueuedModeButton({ paused, busy }: { paused: boolean; busy: boolean }) {
  const { chatId } = useChatPane();
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
      onClick={() => void api.setQueuePaused(chatId, !paused).catch(failed)}
    >
      {paused ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
      <span className="queued-head-label">{paused ? "止めています" : "自動で送る"}</span>
    </button>
  );
}

/**
 * 「一時停止」（自動で送るのを一度止める位置。以前の一時停止の印）を、いちばん上（1 件目の上 = 位置 0）に挟む。
 * 名前は、押した結果（「今の分で止める」など）ではなく、列に挟む物の名前で呼ぶ。置いたあとは、線のつまみのドラッグ・↑↓ で止める位置へ動かす。
 * もう 1 件目の上に印があれば押せない
 */
function QueuedStopButton({ stops, onAdded }: { stops: number[]; onAdded: () => void }) {
  const { chatId } = useChatPane();
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
      onClick={() => void api.setQueueStops(chatId, [0, ...stops]).then(onAdded, failed)}
    >
      <OctagonPause size={12} aria-hidden />
      <span className="queued-head-label">一時停止</span>
    </button>
  );
}

/**
 * 「圧縮」「コンテキスト消去」: その行を列のいちばん下に足す（そこまで送ったら、会話を要約する・新しい会話で始める）。
 * 置いたあとは、行のつまみのドラッグ・↑↓ で位置を決める。色は行と同じ（queueActionLooks の tone）
 */
function QueuedActionButton({ action, onAdded }: { action: QueueAction; onAdded: () => void }) {
  const { chatId } = useChatPane();
  const look = QUEUE_ACTION_LOOKS[action];
  return (
    <button
      type="button"
      className={cx("btn btn-sm queued-head-btn queued-add-action", look.tone)}
      aria-label={`${look.button}の行をいちばん下に足す`}
      title={look.addTitle}
      onClick={() => void api.queueAction(chatId, action).then(onAdded, failed)}
    >
      <look.icon size={12} aria-hidden />
      <span className="queued-head-label">{look.button}</span>
    </button>
  );
}

/** 送信待ちをすべて消す（確かめてから） */
function QueuedRemoveAllButton({ count }: { count: number }) {
  const { chatId } = useChatPane();
  return (
    <button
      type="button"
      className="btn btn-sm queued-head-btn queued-remove"
      aria-label="すべて消す"
      title={`送信待ちの ${count} 件をすべて消す（確かめてから）`}
      onClick={() =>
        void confirmDialog({
          title: `送信待ちの ${count} 件をすべて消しますか？`,
          message: "消した指示は送られません。元に戻せません。",
          confirmLabel: "すべて消す",
          danger: true,
        }).then(async (ok) => {
          if (ok) await api.clearQueued(chatId).catch(failed);
        })
      }
    >
      <Trash2 size={12} aria-hidden />
      <span className="queued-head-label">すべて消す</span>
    </button>
  );
}
