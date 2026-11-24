// 文を書く欄（MessageField）のキーの決まり（純粋関数。React に依存しない）
import { isCancelKey, isSubmitKey, type KeyInput } from "@/foundation/ui/lib/keys";

/** 送るときに押していた修飾キー（⌘Enter = いま・⌘⇧Enter = あとで などを呼ぶ側が決める） */
export interface SubmitHow {
  meta: boolean;
  shift: boolean;
}

/** 修飾キーなしで送る（送信ボタン・保存のボタン） */
export const PLAIN_SUBMIT: SubmitHow = { meta: false, shift: false };

export const submitHowOf = (e: KeyInput): SubmitHow => ({ meta: e.metaKey, shift: e.shiftKey });

/** キーをどう扱ったか（voiceSend = 録音を止めて文字にしてから送る・handled = 呼ぶ側か音声が扱った） */
export type FieldKeyAction = "voiceSend" | "handled" | "submit" | "cancel" | null;

/**
 * 欄のキーを見る順:
 * 1. 録音中の送る Enter（起こした文を入れてから送る。候補の一覧より先）
 * 2. 呼ぶ側（候補の一覧・前の発言の呼び出し。扱ったら true）
 * 3. 音声（⌘⇧Space で録音の開始・停止・録音中の Esc でやめる。扱ったら true）
 * 4. 送る Enter（変換を確定する Enter は送らない。metaShift なら ⌘⇧Enter も）
 * 5. Esc（やめる口があるときだけ）
 */
export function fieldKeyAction(
  e: KeyInput,
  f: { recording: boolean; metaShift: boolean; cancellable: boolean; caller: () => boolean; voice: () => boolean },
): FieldKeyAction {
  const submits = isSubmitKey(e, { metaShift: f.metaShift });
  if (f.recording && submits) return "voiceSend";
  if (f.caller() || f.voice()) return "handled";
  if (submits) return "submit";
  if (f.cancellable && isCancelKey(e)) return "cancel";
  return null;
}
