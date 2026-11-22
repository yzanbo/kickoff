// 入力欄への音声の差し込み（composer の composerSlots の voice。ui/contributes.ts が登録する）。
// 差し込むのは hooks なので遅延読み込みにできない（登録の表から静的に読む）。部品は createElement で作る
// （マイクのボタンは前から入力欄と一緒に、最初の描画の前に読み込まれている）
import { createElement, type KeyboardEvent } from "react";
import { consumeKey, hasModifiers, isCancelKey } from "@/foundation/ui/lib/keys";
import type { ComposerVoiceModeInput, FieldBridge, FieldVoice, FieldVoiceMode } from "@/features/composer/ui";
import { DictationButton, DictationError } from "./DictationButton";
import { insertDictation } from "./dictationText";
import { useDictation } from "./useDictation";
import { useVoiceMode } from "./useVoiceMode";
import { VoiceModeButton, VoiceModePanel } from "./VoiceModePanel";

/** 起こした文を欄のキャレットの位置（選んでいればその範囲）に入れる */
function insertSpoken(bridge: FieldBridge, spoken: string, sendNow: boolean) {
  const { text, start, end } = bridge.read();
  const inserted = insertDictation(text, start, end, spoken);
  bridge.write(inserted.text, inserted.caret, sendNow);
}

/**
 * 文を書く欄 1 つの音声入力（チャット欄・送信待ちの書き直し・質問の「その他」）。
 * 起こした文をキャレットの位置（選んでいればその範囲）に入れる。録音中に送ると、止めて文字にして入れてから送る（finishAndSend）。
 * ⌘⇧Space で開始・停止、録音中・文字起こし中の Esc でやめる
 */
export function useComposerFieldVoice(bridge: FieldBridge): FieldVoice {
  const dictation = useDictation({
    onText: (spoken, send) => insertSpoken(bridge, spoken, send),
  });
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (e.code === "Space" && hasModifiers(e, { meta: true, shift: true })) {
      e.preventDefault();
      dictation.toggle();
    } else if (isCancelKey(e) && (dictation.recording || dictation.state.kind === "transcribing")) {
      consumeKey(e);
      dictation.cancel();
    } else return false;
    return true;
  };
  return {
    recording: dictation.recording,
    finishAndSend: () => void dictation.finish(true),
    onKeyDown,
    button: createElement(DictationButton, { dictation }),
    error: createElement(DictationError, { dictation }),
  };
}

/**
 * チャット欄の音声モード: 話し終わったら、すぐ送る（その間は文を書く欄を隠して帯を出す。書きかけの文はそのまま残す）か、
 * 入力欄に入れる（帯の下に文を書く欄を出したまま、キャレットの位置に足していく）。返答は読み上げる
 */
export function useComposerVoiceMode(bridge: FieldBridge, input: ComposerVoiceModeInput): FieldVoiceMode {
  const voice = useVoiceMode({
    replies: input.replies,
    busy: input.busy,
    send: input.send,
    draft: input.draft,
    chatId: input.chatId,
    fill: (spoken) => insertSpoken(bridge, spoken, false),
  });
  return {
    active: voice.active,
    sends: voice.active && voice.delivery === "send",
    stop: voice.stop,
    beforeSend: voice.beforeSend,
    noteSent: voice.noteSent,
    panel: voice.active ? createElement(VoiceModePanel, { voice, queueToggle: input.queueToggle }) : null,
    button: createElement(VoiceModeButton, { voice }),
  };
}
