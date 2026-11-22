// 入力欄への差し込み口（入力欄より上の機能が ui/contributes.ts で登録する。音声は voice）
import type { KeyboardEvent, ReactNode } from "react";
import { definePoint } from "@/foundation/ui/points";
import type { VoiceReply } from "./selectors";

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

/** 音声モード（チャット欄の波形のボタン）に渡すもの */
export interface ComposerVoiceModeInput {
  /** 読み上げる候補の返答 */
  replies: VoiceReply[];
  /** 起こした文を送る口（作業中なら、いま / あとでの送り方で） */
  send: (text: string) => Promise<void>;
  /** 既存のチャット（引き継がれたら音声モードを続ける） */
  chatId?: number;
  /** 送る前の新しいチャット（送ったら、できたチャットへ音声モードを引き継ぐ） */
  draft?: boolean;
  busy: boolean;
  /** 帯に出す作業中の送り方（いま / あとで） */
  queueToggle?: ReactNode;
}

/** チャット欄の音声モード */
export interface FieldVoiceMode {
  active: boolean;
  /** すぐ送る音声モード（文を書く欄を隠して帯を出す） */
  sends: boolean;
  stop(): void;
  /** チャット欄から送る前（新しいチャットなら引き継ぐ印を付ける） */
  beforeSend(): void;
  /** チャット欄から送った（止めていた読み上げを戻す） */
  noteSent(): void;
  /** 文を書く欄の上の帯（使っている間だけ） */
  panel: ReactNode;
  /** 波形のボタン */
  button: ReactNode;
}

/**
 * 差し込み。voice の hooks は描くたびに必ず 1 回ずつ呼ぶ（登録は起動の前に 1 回だけ入るので、呼ぶ hooks は変わらない）
 */
export type ComposerSlot = { kind: "voice"; useField: (bridge: FieldBridge) => FieldVoice; useMode: (bridge: FieldBridge, input: ComposerVoiceModeInput) => FieldVoiceMode };

export const composerSlots = definePoint<ComposerSlot>("composerSlots", { key: (s) => s.kind });

/** 音声の登録がないとき（音声なし） */
export const NO_VOICE: FieldVoice = { recording: false, finishAndSend: () => {}, onKeyDown: () => false, button: null, error: null };
const NO_VOICE_MODE: FieldVoiceMode = { active: false, sends: false, stop: () => {}, beforeSend: () => {}, noteSent: () => {}, panel: null, button: null };
const NO_VOICE_SLOT: ComposerSlot = { kind: "voice", useField: () => NO_VOICE, useMode: () => NO_VOICE_MODE };

const voiceSlot = (): ComposerSlot => composerSlots.items().find((s) => s.kind === "voice") ?? NO_VOICE_SLOT;

/** 欄 1 つの音声入力（登録した機能の hook を呼ぶ） */
export function useFieldVoice(bridge: FieldBridge): FieldVoice {
  return voiceSlot().useField(bridge);
}

/** チャット欄の音声モード（登録した機能の hook を呼ぶ） */
export function useVoiceMode(bridge: FieldBridge, input: ComposerVoiceModeInput): FieldVoiceMode {
  return voiceSlot().useMode(bridge, input);
}
