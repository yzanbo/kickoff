// 入力欄への差し込み口（入力欄より上の機能が ui/contributes.ts で登録する: 定型文の帯と右クリックの項目 = snippets・メーター = compact・
// ピル = notes・音声 = voice）。登録の表は中身を静的に読まず load で渡し、main.tsx が最初の描画の前に loadComposerSlots で読み終える
// （描くときに待たない。帯・メーター・マイクが遅れて出て、下の行の幅の測り直しが漏れないように。音声の hooks は描く前に決まっていないといけない）
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import type { Attachment } from "@shared/chat/types";
import { definePoint } from "@/foundation/ui/points";
import type { VoiceReply } from "./selectors";

/** どこの入力欄か（候補を探す作業場所・「ほかのチャットを参照」で除くチャット・差し込みに渡すもの） */
export interface ComposerPlace {
  projectId: number;
  /** 候補を探すワークツリー（null は本体） */
  worktree: string | null;
  /** 既存のチャット（送る前の欄は null） */
  chatId: number | null;
  /** 出さない差し込み（既定は全部出す） */
  slots?: { band?: false; meter?: false; menu?: false };
}

/** 定型文の帯（入れるのは useComposerInsert。send は「すぐ送る」。なければ入れるだけ） */
export interface ComposerBandProps {
  place: ComposerPlace;
  send?: (text: string) => Promise<void>;
}

/** 入力欄の上のピル（ノート）。attach は送る前の欄の下書きに添付を足す（既存のチャットは自分で足す） */
export interface ComposerPillProps {
  projectId: number;
  chatId: number | null;
  attach?: (attachment: Attachment) => void;
}

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

/** 音声の差し込み（hooks。描くたびに必ず 1 回ずつ呼ぶ。最初の描画の前に読み終えるので、呼ぶ hooks は変わらない） */
export interface ComposerVoiceHooks {
  useField: (bridge: FieldBridge) => FieldVoice;
  useMode: (bridge: FieldBridge, input: ComposerVoiceModeInput) => FieldVoiceMode;
}

export type ComposerSlot =
  | { kind: "band"; id: string; order: number; load: () => Promise<ComponentType<ComposerBandProps>> }
  | { kind: "menu"; id: string; order: number; load: () => Promise<ComponentType<{ place: ComposerPlace }>> }
  | { kind: "meter"; id: string; load: () => Promise<ComponentType<{ place: ComposerPlace }>> }
  | { kind: "pill"; id: string; order: number; load: () => Promise<ComponentType<ComposerPillProps>> }
  | { kind: "voice"; id: string; load: () => Promise<ComposerVoiceHooks> };

const orderOf = (s: ComposerSlot) => ("order" in s ? s.order : 0);

export const composerSlots = definePoint<ComposerSlot>("composerSlots", { key: (s) => `${s.kind}:${s.id}`, order: (a, b) => orderOf(a) - orderOf(b) });

/** 音声の登録がないとき（音声なし） */
export const NO_VOICE: FieldVoice = { recording: false, finishAndSend: () => {}, onKeyDown: () => false, button: null, error: null };
const NO_VOICE_MODE: FieldVoiceMode = { active: false, sends: false, stop: () => {}, beforeSend: () => {}, noteSent: () => {}, panel: null, button: null };
const NO_VOICE_HOOKS: ComposerVoiceHooks = { useField: () => NO_VOICE, useMode: () => NO_VOICE_MODE };

interface ComposerParts {
  bands: ComponentType<ComposerBandProps>[];
  menus: ComponentType<{ place: ComposerPlace }>[];
  meter: ComponentType<{ place: ComposerPlace }> | null;
  pills: ComponentType<ComposerPillProps>[];
  voice: ComposerVoiceHooks;
}
const NO_PARTS: ComposerParts = { bands: [], menus: [], meter: null, pills: [], voice: NO_VOICE_HOOKS };
let parts: ComposerParts | null = null;

/** 差し込みの中身を読み終える（main.tsx が最初の描画の前に 1 回） */
export async function loadComposerSlots(): Promise<void> {
  const items = composerSlots.items();
  const loadedItems = await Promise.all(items.map((s) => s.load()));
  const of = (kind: ComposerSlot["kind"]): unknown[] => items.flatMap((s, i) => (s.kind === kind ? [loadedItems[i]] : []));
  parts = {
    bands: of("band") as ComposerParts["bands"],
    menus: of("menu") as ComposerParts["menus"],
    meter: (of("meter")[0] as ComposerParts["meter"] | undefined) ?? null,
    pills: of("pill") as ComposerParts["pills"],
    voice: (of("voice")[0] as ComposerVoiceHooks | undefined) ?? NO_VOICE_HOOKS,
  };
}

/** 読み終えた差し込み（読み終えていなければ空） */
export const composerParts = (): ComposerParts => parts ?? NO_PARTS;

/** 入力欄の上のピル（ノート）。ピルの列を描く側（会話の画面・新しいチャット・新しい子チャット）が並べる */
export const composerPills = (): readonly ComponentType<ComposerPillProps>[] => composerParts().pills;

/** 欄 1 つの音声入力（登録した機能の hook を呼ぶ） */
export function useFieldVoice(bridge: FieldBridge): FieldVoice {
  return composerParts().voice.useField(bridge);
}

/** チャット欄の音声モード（登録した機能の hook を呼ぶ） */
export function useVoiceMode(bridge: FieldBridge, input: ComposerVoiceModeInput): FieldVoiceMode {
  return composerParts().voice.useMode(bridge, input);
}
