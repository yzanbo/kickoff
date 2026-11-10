import { useEffect, useRef, type ReactNode } from "react";
import { AudioLines, SendHorizontal, SkipForward, TextCursorInput, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { ErrorText } from "@/ui/ErrorText";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { Segmented, type SegmentOption } from "@/ui/Segmented";
import type { VoiceMode, VoiceDelivery } from "./useVoiceMode";

/** 話し終わったときの扱いの選択肢 */
const DELIVERY_OPTIONS: SegmentOption<VoiceDelivery>[] = [
  { value: "send", label: "すぐ送る", icon: SendHorizontal, tip: "すぐ送る（話し終わって少し黙ると送ります。AI が作業中なら、右の「いま / あとで」で送ります）" },
  { value: "fill", label: "入力欄に入れる", icon: TextCursorInput, tip: "入力欄に入れる（起こした文をチャット欄に残します。直してから Enter で送ります）" },
];

/** 様子ごとの見出し */
function stateText(voice: VoiceMode): string {
  const { state } = voice;
  const fill = voice.delivery === "fill";
  switch (state.kind) {
    case "listening":
      if (state.heard) return fill ? "聞いています…（話し終わって少し黙ると、入力欄に入れます）" : "聞いています…（話し終わって少し黙ると送ります）";
      if (voice.busy) return voice.muted ? "AI が作業中です（読み上げは止めています。次に送ると、また読み上げます）" : "AI が作業中です。話しかけてもかまいません";
      return "どうぞ、話してください";
    case "transcribing":
      return "文字にしています…";
    case "speaking":
      return "AI が話しています…（話しかけると止まります）";
    default:
      return "マイクを準備しています…";
  }
}

/** チャット欄の下の道具の波形のボタン（音声モードを始める・終える） */
export function VoiceModeButton({ voice }: { voice: VoiceMode }) {
  return (
    <IconButton
      icon={AudioLines}
      label={voice.active ? "音声モードを終了" : "音声モード"}
      title={
        voice.active
          ? "音声モードを終了"
          : voice.ready
            ? "音声モード（話し終わったら送るか入力欄に入れ、AI の返答の文章を読み上げます。AI の作業中も聞き続け、読み上げ中に話すと止まります）"
            : "音声入力の準備ができていません。押すと設定の「音声入力」を開きます"
      }
      size={16}
      className={cx("attach-button voice-mode-button", voice.active && "active", !voice.ready && "unready")}
      type="button"
      aria-pressed={voice.active}
      onClick={voice.active ? voice.stop : voice.start}
    />
  );
}

/**
 * 音声モードの間、チャット欄の上に出す帯: マイクの音量で大きさの変わる丸・いまの様子・起こした自分の文・失敗の文と、
 * 聞いている間の「話し終えた」（黙るのを待たない）・読み上げ中の「読み上げを止める」・終了。
 * 下の行で、話し終わったら「すぐ送る / 入力欄に入れる」と、すぐ送るときの作業中の送り方（queueToggle。いま / あとで）を選ぶ
 */
export function VoiceModePanel({ voice, queueToggle }: { voice: VoiceMode; queueToggle?: ReactNode }) {
  const orb = useRef<HTMLSpanElement>(null);
  const { subscribeLevel } = voice;
  useEffect(
    () =>
      subscribeLevel((level) => {
        // 話し声の RMS はおよそ 0.02〜0.2。0〜1 に広げて丸の大きさにする
        orb.current?.style.setProperty("--voice-level", String(Math.min(1, level * 8)));
      }),
    // 受け取る先はチャット欄が持つ 1 つの入れ物なので、描き直しのたびに付け直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { state } = voice;
  const fill = voice.delivery === "fill";
  return (
    <div className={cx("voice-mode", `voice-mode-${state.kind}`)}>
      <div className="voice-mode-main">
        <span ref={orb} className="voice-mode-orb" aria-hidden>
          <AudioLines size={18} />
        </span>
        <div className="voice-mode-body" role="status" aria-live="polite">
          <b className="voice-mode-state">{stateText(voice)}</b>
          {voice.heard && <span className="voice-mode-heard">あなた: {voice.heard}</span>}
          {voice.error && (
            <span className="voice-mode-error">
              <ErrorText message={voice.error} />
              <CloseButton label="閉じる" size={13} type="button" onClick={voice.dismissError} />
            </span>
          )}
        </div>
        <div className="voice-mode-actions">
          {state.kind === "listening" && state.heard && (
            <button type="button" className="voice-mode-action" onClick={voice.sendNow} title={fill ? "黙るのを待たずに、ここまでを入力欄に入れる" : "黙るのを待たずに、ここまでを送る"}>
              {fill ? <TextCursorInput size={13} aria-hidden /> : <SendHorizontal size={13} aria-hidden />}
              話し終えた
            </button>
          )}
          {state.kind === "speaking" && (
            <button type="button" className="voice-mode-action" onClick={voice.skip} title="読み上げを止める（次に送るか、作業が終わるまで読みません）">
              <SkipForward size={13} aria-hidden />
              読み上げを止める
            </button>
          )}
          <button type="button" className="voice-mode-action voice-mode-end" onClick={voice.stop}>
            <X size={13} aria-hidden />
            終了
          </button>
        </div>
      </div>
      <div className="voice-mode-options">
        <span className="voice-mode-option-label">話し終わったら</span>
        <Segmented<VoiceDelivery> value={voice.delivery} options={DELIVERY_OPTIONS} onChange={voice.setDelivery} label="話し終わったときの扱い" className="view-toggle queue-mode voice-mode-delivery" />
        {!fill && queueToggle && (
          <>
            <span className="voice-mode-option-label">作業中は</span>
            {queueToggle}
          </>
        )}
      </div>
    </div>
  );
}
