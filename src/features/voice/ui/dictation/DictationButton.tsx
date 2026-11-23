import { ChevronDown, Mic } from "lucide-react";
import { useRef, type PointerEvent } from "react";
import { useLevelVar } from "@/features/voice/ui/capture/levelChannel";
import { cx } from "@/foundation/ui/lib/cx";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { CloseButton, IconButton } from "@/foundation/ui/kit/IconButton";
import { useDictationMenu } from "./DictationMenu";
import type { Dictation } from "./useDictation";

/** 音声入力のショートカット（チャット欄にピントがあるときだけ） */
const DICTATION_SHORTCUT = "⌘⇧Space";

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

/** 音量の表示の戻り方（声が止んだら、1 回ごとにこの割合まで縮める。上がるときはすぐ） */
const LEVEL_DECAY = 0.8;

/**
 * 録音中の音量を、包みの要素の --mic-level（0〜1）に入れる（描き直しをせずに、マイクの輪と横の棒の高さを変える）。
 * 声を拾っているかを目で見せる（経過時間だけだと、話しても何も動かず、届いているか分からない）
 */
function useMicLevel(dictation: Dictation) {
  const ref = useRef<HTMLSpanElement>(null);
  useLevelVar(dictation.subscribeLevel, "--mic-level", ref, { decay: LEVEL_DECAY, digits: 3 });
  return ref;
}

/** 録音中の部分（音量で広がる輪の付いたマイク・音量の棒・経過時間・やめる） */
function RecordingControls({ dictation, startedAt }: { dictation: Dictation; startedAt: number }) {
  const ref = useMicLevel(dictation);
  return (
    <span ref={ref} className="dictation-recording">
      <IconButton
        size="lg"
        icon={Mic}
        label="録音を止めて文字起こし"
        title={`録音を止めて、文字起こしした文を入れる（${DICTATION_SHORTCUT}）。送信ボタン・Enter なら入れてそのまま送る`}
        iconSize={16}
        className="attach-button dictation-button recording"
        type="button"
        {...pressHandlers(dictation)}
      />
      <span className="dictation-level" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <RecordingTime startedAt={startedAt} />
      <CloseButton size="sm" label="録音をやめる（Esc）" iconSize={13} className="dictation-cancel" type="button" onClick={dictation.cancel} />
    </span>
  );
}

/**
 * マイクのボタンを押したとき: 押し始めを知らせ、離したら（ボタンの外で離しても。録音中は別のボタンに描き替わるので window で受ける）知らせる。
 * 短く押せば 1 回押し（もう一度押すまで録る）、長く押せば離したところで止めて起こす（useDictation の press / release）
 */
function pressHandlers(dictation: Dictation) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      dictation.press();
      const up = () => {
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        dictation.release();
      };
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    // キーボード（Enter・Space）で押したときだけ（マウスは押し始めと離したときに扱った）
    onClick: (e: { detail: number }) => {
      if (e.detail === 0) dictation.toggle();
    },
  };
}

/**
 * チャット欄の下の道具のマイクのボタン（1 回押して話し始め、話し終わったらもう一度押す。押したまま話して離してもよい）と、
 * 右の ▾（右クリックでも開く）の音声入力の設定のメニュー（使うマイク・話す言語）。
 * 録音中は赤くして、音量（マイクの輪と棒）・経過時間・やめるボタン、文字起こし中はスピナーを添える
 */
export function DictationButton({ dictation }: { dictation: Dictation }) {
  const menu = useDictationMenu();
  return (
    <span className="dictation-control" onContextMenu={menu.open}>
      <DictationState dictation={dictation} />
      {dictation.state.kind !== "recording" && dictation.state.kind !== "transcribing" && (
        <IconButton icon={ChevronDown} label="音声入力の設定" title="音声入力の設定（使うマイク・話す言語）" iconSize={12} className={cx("dictation-more", menu.isOpen && "open")} type="button" onClick={menu.toggle} />
      )}
      {menu.element}
    </span>
  );
}

/** マイクのボタン（いまの状態ごと） */
function DictationState({ dictation }: { dictation: Dictation }) {
  const { state, ready } = dictation;
  if (state.kind === "recording") return <RecordingControls dictation={dictation} startedAt={state.startedAt} />;
  if (state.kind === "transcribing") {
    return (
      <span className="dictation-status" role="status">
        <span className="spinner" aria-hidden />
        文字起こし中…
        <CloseButton size="sm" label="文字起こしをやめる" iconSize={13} className="dictation-cancel" type="button" onClick={dictation.cancel} />
      </span>
    );
  }
  return (
    <IconButton
      size="lg"
      icon={Mic}
      label={ready ? "音声入力" : "音声入力の設定を開く"}
      title={
        ready
          ? `音声入力（${DICTATION_SHORTCUT}）。1 回押して話し始め、話し終わったらもう一度押してください。押したまま話して、離しても入ります。右クリックでマイクと言語を選べます`
          : "音声入力の準備ができていません。押すと設定の「音声入力」を開きます"
      }
      iconSize={16}
      className={cx("attach-button dictation-button", !ready && "unready")}
      type="button"
      disabled={state.kind === "starting"}
      {...pressHandlers(dictation)}
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
      <CloseButton label="閉じる" iconSize={13} type="button" onClick={dictation.dismiss} />
    </div>
  );
}
