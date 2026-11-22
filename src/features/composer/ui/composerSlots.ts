// 入力欄への差し込み口（入力欄より上の機能が ui/contributes.ts で登録する。音声は voice）
import type { KeyboardEvent, ReactNode } from "react";
import { definePoint } from "@/foundation/ui/points";

/** 文を書く欄 1 つと音声をつなぐ口（MessageField が作る） */
export interface FieldBridge {
  /** いまの文と選んでいる範囲 */
  read(): { text: string; start: number; end: number };
  /** 文を入れ替えてキャレットを caret に置く。sendNow なら入れたあとそのまま送る（録音中に送ったとき） */
  write(text: string, caret: number, sendNow: boolean): void;
}

/** 欄 1 つの音声入力（マイク） */
export interface FieldVoice {
  /** 録音中か（送ると、止めて文字にしてから送る） */
  recording: boolean;
  /** 録音を止めて文字にし、入れてから送る（write の sendNow） */
  finishAndSend(): void;
  /** ⌘⇧Space で録音の開始・停止・録音中と文字起こし中の Esc でやめる（扱ったら true） */
  onKeyDown(e: KeyboardEvent<HTMLElement>): boolean;
  /** マイクのボタン */
  button: ReactNode;
  /** 失敗の文と「もう一度」（欄の下に置く） */
  error: ReactNode;
}

/**
 * 差し込み。voice の hooks は描くたびに必ず 1 回ずつ呼ぶ（登録は起動の前に 1 回だけ入るので、呼ぶ hooks は変わらない）
 */
export type ComposerSlot = { kind: "voice"; useField: (bridge: FieldBridge) => FieldVoice };

export const composerSlots = definePoint<ComposerSlot>("composerSlots", { key: (s) => s.kind });

/** 音声の登録がないとき（音声なし） */
export const NO_VOICE: FieldVoice = { recording: false, finishAndSend: () => {}, onKeyDown: () => false, button: null, error: null };
const NO_VOICE_SLOT: ComposerSlot = { kind: "voice", useField: () => NO_VOICE };

const voiceSlot = (): ComposerSlot => composerSlots.items().find((s) => s.kind === "voice") ?? NO_VOICE_SLOT;

/** 欄 1 つの音声入力（登録した機能の hook を呼ぶ） */
export function useFieldVoice(bridge: FieldBridge): FieldVoice {
  return voiceSlot().useField(bridge);
}
