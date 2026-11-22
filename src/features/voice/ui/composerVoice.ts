// 入力欄への音声の差し込み（composer の composerSlots の voice。ui/contributes.ts が登録する）。
// 差し込むのは hooks なので遅延読み込みにできない（登録の表から静的に読む）。部品は createElement で作る
// （マイクのボタンは前から入力欄と一緒に、最初の描画の前に読み込まれている）
import { createElement, type KeyboardEvent } from "react";
import { consumeKey, hasModifiers, isCancelKey } from "@/foundation/ui/lib/keys";
import type { FieldBridge, FieldVoice } from "@/features/composer/ui";
import { DictationButton, DictationError } from "./DictationButton";
import { insertDictation } from "./dictationText";
import { useDictation } from "./useDictation";

/**
 * 文を書く欄 1 つの音声入力（チャット欄・送信待ちの書き直し・質問の「その他」）。
 * 起こした文をキャレットの位置（選んでいればその範囲）に入れる。録音中に送ると、止めて文字にして入れてから送る（finishAndSend）。
 * ⌘⇧Space で開始・停止、録音中・文字起こし中の Esc でやめる
 */
export function useComposerFieldVoice(bridge: FieldBridge): FieldVoice {
  const dictation = useDictation({
    onText: (spoken, send) => {
      const { text, start, end } = bridge.read();
      const inserted = insertDictation(text, start, end, spoken);
      bridge.write(inserted.text, inserted.caret, send);
    },
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
