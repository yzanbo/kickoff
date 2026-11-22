// 入力欄への音声の差し込み（composer の composerSlots の voice。ui/contributes.ts が load で登録し、最初の描画の前に読み終える）
import type { KeyboardEvent } from "react";
import { consumeKey, hasModifiers, isCancelKey } from "@/foundation/ui/lib/keys";
import type { ComposerVoiceHooks, ComposerVoiceModeInput, FieldBridge, FieldVoice, FieldVoiceMode } from "@/features/composer/ui";
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
function useComposerFieldVoice(bridge: FieldBridge): FieldVoice {
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
    button: <DictationButton dictation={dictation} />,
    error: <DictationError dictation={dictation} />,
  };
}

/**
 * チャット欄の音声モード: 話し終わったら、すぐ送る（その間は文を書く欄を隠して帯を出す。書きかけの文はそのまま残す）か、
 * 入力欄に入れる（帯の下に文を書く欄を出したまま、キャレットの位置に足していく）。返答は読み上げる
 */
function useComposerVoiceMode(bridge: FieldBridge, input: ComposerVoiceModeInput): FieldVoiceMode {
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
    panel: voice.active ? <VoiceModePanel voice={voice} queueToggle={input.queueToggle} /> : null,
    button: <VoiceModeButton voice={voice} />,
  };
}

/** 入力欄に差し込む音声の hooks */
export const composerVoice: ComposerVoiceHooks = { useField: useComposerFieldVoice, useMode: useComposerVoiceMode };
