import { Mic } from "lucide-react";
import { cx } from "@/lib/cx";
import { useTicker } from "@/hooks/useTicker";
import { ErrorText } from "@/ui/ErrorText";
import { CloseButton, IconButton } from "@/ui/IconButton";
import type { Dictation } from "./useDictation";

/** 音声入力のショートカット（チャット欄にピントがあるときだけ） */
export const DICTATION_SHORTCUT = "⌘⇧Space";

/** 録音の経過時間（m:ss。録音している間だけ 0.5 秒ごとに描き直す） */
function RecordingTime({ startedAt }: { startedAt: number }) {
  useTicker(500);
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  return (
    <span className="dictation-time" aria-live="off">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * チャット欄の下の道具のマイクのボタン（1 回押して話し始め、話し終わったらもう一度押す）。
 * 録音中は赤くして経過時間とやめるボタン、文字起こし中はスピナーを添える
 */
export function DictationButton({ dictation }: { dictation: Dictation }) {
  const { state, ready } = dictation;
  if (state.kind === "recording") {
    return (
      <span className="dictation-recording">
        <IconButton
          icon={Mic}
          label="録音を止めて文字起こし"
          title={`録音を止めて、文字起こしした文を入れる（${DICTATION_SHORTCUT}）。送信ボタン・Enter なら入れてそのまま送る`}
          size={16}
          className="attach-button dictation-button recording"
          type="button"
          onClick={() => void dictation.finish(false)}
        />
        <RecordingTime startedAt={state.startedAt} />
        <CloseButton label="録音をやめる（Esc）" size={13} className="dictation-cancel" type="button" onClick={dictation.cancel} />
      </span>
    );
  }
  if (state.kind === "transcribing") {
    return (
      <span className="dictation-status" role="status">
        <span className="spinner" aria-hidden />
        文字起こし中…
        <CloseButton label="文字起こしをやめる" size={13} className="dictation-cancel" type="button" onClick={dictation.cancel} />
      </span>
    );
  }
  return (
    <IconButton
      icon={Mic}
      label={ready ? "音声入力" : "音声入力の設定を開く"}
      title={
        ready
          ? `音声入力（${DICTATION_SHORTCUT}）。1 回押して話し始め、話し終わったらもう一度押してください`
          : "音声入力の準備ができていません。押すと設定の「音声入力」を開きます"
      }
      size={16}
      className={cx("attach-button dictation-button", !ready && "unready")}
      type="button"
      disabled={state.kind === "starting"}
      onClick={dictation.toggle}
    />
  );
}

/** 音声入力の失敗の文と、録った音声で起こし直す「もう一度」（入力欄の下に出す） */
export function DictationError({ dictation }: { dictation: Dictation }) {
  const { state } = dictation;
  if (state.kind !== "error") return null;
  return (
    <div className="dictation-error">
      <ErrorText message={state.message} />
      {state.audio && (
        <button type="button" className="link-button accent" onClick={dictation.retry}>
          もう一度
        </button>
      )}
      <CloseButton label="閉じる" size={13} type="button" onClick={dictation.dismiss} />
    </div>
  );
}
