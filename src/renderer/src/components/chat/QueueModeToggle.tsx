import { ListPlus, MessageSquarePlus } from "lucide-react";
import { useStoredState } from "../../hooks/useStoredState";
import { QUEUE_MODE_KEY } from "../../storageKeys";
import { Segmented, type SegmentOption } from "../Segmented";
import type { QueueSendMode } from "./composerKeys";

/**
 * 作業中に送ったときの扱いの選択肢。いつ送るかの対で「あとで ｜ いま」と短く見せる（送信待ちに足す・いまのやり取りに追加の指示として送る、は長いので説明へ）。
 * 押すと送るボタンに見えないよう、アイコン（あとで = リスト・いま = 吹き出し。送るの矢印は使わない）に文字を添えた切り替えにし、
 * マウスを乗せたときの説明に、どちらを選んでいても使えるショートカットのキーを添える
 */
const BUSY_OPTIONS: SegmentOption<QueueSendMode>[] = [
  { value: "queue", label: "あとで", icon: ListPlus, tip: "あとで送る（送信待ちに足し、いまの作業が終わったら順に送ります）", keys: "⌘⇧Enter" },
  {
    value: "tell",
    label: "いま",
    icon: MessageSquarePlus,
    tip: "いま送る（作業を止めずに、いまのやり取りへ追加の指示として送ります。AI は手順の切れ目で読みます）",
    keys: "⌘Enter",
  },
];

/**
 * 作業していないが送信待ちが残っている（止めている）ときの選択肢（値・文字は作業中と同じで、同じ保存の値で覚える）。
 * 「いま」は送信待ちより先にいま送り、「あとで」は送信待ちの最後に足す
 */
const IDLE_OPTIONS: SegmentOption<QueueSendMode>[] = [
  { value: "queue", label: "あとで", icon: ListPlus, tip: "あとで送る（送信待ちの最後に足します）", keys: "⌘⇧Enter" },
  { value: "tell", label: "いま", icon: MessageSquarePlus, tip: "いま送る（送信待ちより先に、いま送ります）", keys: "⌘Enter" },
];

/** 保存の形（以前の「割り込む」= "interrupt" は、なくしたので「伝える」として読む） */
const readQueueMode = (raw: string | null): QueueSendMode => (raw === "queue" ? "queue" : "tell");

/** 作業中・送信待ちがあるときに送ったときの扱い（いま / あとで。どのチャットでも同じ） */
export const useQueueMode = () => useStoredState<QueueSendMode>(QUEUE_MODE_KEY, readQueueMode, (mode) => mode);

/** チャット欄の送り方の切り替え（あとで / いま。作業中と、送信待ちを止めているときで説明だけ変える） */
export function QueueModeToggle({ busy, value, onChange }: { busy: boolean; value: QueueSendMode; onChange: (mode: QueueSendMode) => void }) {
  return (
    <Segmented<QueueSendMode>
      value={value}
      options={busy ? BUSY_OPTIONS : IDLE_OPTIONS}
      onChange={onChange}
      label={busy ? "作業中に Enter で送ったときの扱い" : "送信待ちがあるときに Enter で送ったときの扱い"}
      className="view-toggle queue-mode"
    />
  );
}


/** チャット欄の案内と送信ボタンの名前（作業中か・送信待ちがあるか・送り方で変える） */
export function queueModeTexts(busy: boolean, queued: boolean, mode: QueueSendMode): { placeholder: string; sendLabel?: string } {
  if (busy)
    return mode === "tell"
      ? { placeholder: "作業中です。Enter でいま送ります（止めずに、いまのやり取りに足す。⌘⇧Enter であとで送る）", sendLabel: "いま送る（止めずに）" }
      : { placeholder: "作業中です。Enter であとで送ります（終わったら順に送る。⌘Enter でいま送る）", sendLabel: "あとで送る" };
  if (queued)
    return mode === "tell"
      ? { placeholder: "送信待ちがあります。Enter でいま送ります（送信待ちより先に。⌘⇧Enter であとで送る）", sendLabel: "いま送る（送信待ちより先に）" }
      : { placeholder: "送信待ちがあります。Enter であとで送ります（送信待ちの最後に足す。⌘Enter でいま送る）", sendLabel: "あとで送る（送信待ちの最後に）" };
  return { placeholder: "続けて指示する（Enter で送信、Shift+Enter で改行）" };
}
