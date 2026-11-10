import { useEffect, useRef } from "react";
import { AudioLines, SendHorizontal, SkipForward, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { ErrorText } from "@/ui/ErrorText";
import { CloseButton, IconButton } from "@/ui/IconButton";
import type { VoiceModeState } from "./voiceSession";
import type { VoiceMode } from "./useVoiceMode";

/** 様子ごとの見出し */
function stateText(state: VoiceModeState): string {
  switch (state.kind) {
    case "listening":
      return state.heard ? "聞いています…（話し終わって少し黙ると送ります）" : "どうぞ、話してください";
    case "transcribing":
      return "文字にしています…";
    case "waiting":
      return "AI が答えを考えています…";
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
            ? "音声モード（話しかけると送り、AI の返答の文章を読み上げます。読み終えたらまた聞きます。読み上げ中に話すと止まります）"
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
 * 音声モードの間、チャット欄の文を書く欄の代わりに出す帯: マイクの音量で大きさの変わる丸・いまの様子・起こした自分の文・失敗の文と、
 * 聞いている間の「いま送る」（黙るのを待たない）・読み上げ中の「読み上げを止める」・終了
 */
export function VoiceModePanel({ voice }: { voice: VoiceMode }) {
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
  return (
    <div className={cx("voice-mode", `voice-mode-${state.kind}`)}>
      <span ref={orb} className="voice-mode-orb" aria-hidden>
        <AudioLines size={18} />
      </span>
      <div className="voice-mode-body" role="status" aria-live="polite">
        <b className="voice-mode-state">{stateText(state)}</b>
        {voice.heard && <span className="voice-mode-heard">あなた: {voice.heard}</span>}
        {voice.error && (
          <span className="voice-mode-error">
            <ErrorText message={voice.error} />
            <CloseButton label="閉じる" size={13} type="button" onClick={voice.dismissError} />
          </span>
        )}
      </div>
      <div className="voice-mode-actions">
        {state.kind === "listening" && (
          <button type="button" className="voice-mode-action" onClick={voice.sendNow}>
            <SendHorizontal size={13} aria-hidden />
            いま送る
          </button>
        )}
        {state.kind === "speaking" && (
          <button type="button" className="voice-mode-action" onClick={voice.skip}>
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
  );
}
