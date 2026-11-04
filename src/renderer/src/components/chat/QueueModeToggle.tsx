import { Hourglass, SendHorizontal } from "lucide-react";
import { useStoredState } from "../../hooks/useStoredState";
import { QUEUE_MODE_KEY } from "../../storageKeys";
import { Segmented, type SegmentOption } from "../Segmented";
import type { QueueSendMode } from "./composerKeys";

/** 作業中に送ったときの扱いの選択肢（アイコンだけで出す。ためておく = 砂時計（あとで送る）・伝える = 送るの矢印（いま送る）で見分ける） */
const BUSY_OPTIONS: SegmentOption<QueueSendMode>[] = [
  { value: "queue", label: "ためておく（いまの作業が終わったら送る。どちらを選んでいても ⌘⇧Enter でためておける）", icon: Hourglass, iconOnly: true },
  { value: "tell", label: "伝える（止めずに、いま送っていまのやり取りに足す。どちらを選んでいても ⌘Enter で伝えられる）", icon: SendHorizontal, iconOnly: true },
];

/**
 * 作業していないが送信待ちが残っている（止めている）ときの選択肢（値は作業中と同じものを使い、同じ保存の値で覚える）。
 * 「伝える」はいま送る（送信待ちより先に）、「ためておく」は送信待ちの最後に足す
 */
const IDLE_OPTIONS: SegmentOption<QueueSendMode>[] = [
  { value: "queue", label: "ためておく（送信待ちの最後に足す。どちらを選んでいても ⌘⇧Enter でためておける）", icon: Hourglass, iconOnly: true },
  { value: "tell", label: "すぐ送る（送信待ちより先に、いま送る。どちらを選んでいても ⌘Enter ですぐ送れる）", icon: SendHorizontal, iconOnly: true },
];

/** 保存の形（以前の「割り込む」= "interrupt" は、なくしたので「伝える」として読む） */
const readQueueMode = (raw: string | null): QueueSendMode => (raw === "queue" ? "queue" : "tell");

/** 作業中・送信待ちがあるときに送ったときの扱い（伝える・すぐ送る / ためておく。どのチャットでも同じ） */
export const useQueueMode = () => useStoredState<QueueSendMode>(QUEUE_MODE_KEY, readQueueMode, (mode) => mode);

/** チャット欄の送り方の切り替え（作業中は 伝える / ためておく、送信待ちを止めているときは すぐ送る / ためておく） */
export function QueueModeToggle({ busy, value, onChange }: { busy: boolean; value: QueueSendMode; onChange: (mode: QueueSendMode) => void }) {
  return (
    <Segmented<QueueSendMode>
      value={value}
      options={busy ? BUSY_OPTIONS : IDLE_OPTIONS}
      onChange={onChange}
      label={busy ? "作業中に送ったときの扱い" : "送信待ちがあるときに送ったときの扱い"}
      className="view-toggle queue-mode"
    />
  );
}

/** チャット欄の案内と送信ボタンの名前（作業中か・送信待ちがあるか・送り方で変える） */
export function queueModeTexts(busy: boolean, queued: boolean, mode: QueueSendMode): { placeholder: string; sendLabel?: string } {
  if (busy)
    return mode === "tell"
      ? { placeholder: "作業中です。Enter で、止めずにいまのやり取りに伝えます（⌘⇧Enter でためておく）", sendLabel: "止めずに伝える" }
      : { placeholder: "作業中です。Enter でためておき、終わったら送ります（⌘Enter で止めずに伝える）", sendLabel: "ためておく" };
  if (queued)
    return mode === "tell"
      ? { placeholder: "送信待ちがあります。Enter ですぐ送ります（⌘⇧Enter で送信待ちの最後に足す）", sendLabel: "すぐ送る（送信待ちより先に）" }
      : { placeholder: "送信待ちがあります。Enter で送信待ちの最後に足します（⌘Enter ですぐ送る）", sendLabel: "送信待ちの最後に足す" };
  return { placeholder: "続けて指示する（Enter で送信、Shift+Enter で改行）" };
}
