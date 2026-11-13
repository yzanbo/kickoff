// 文字起こしの部品どうしで使う型（画面と共有する型は types/voice.ts）
import type { SpeechOptions } from "./speech.js";

/** 画面から受け取った音声 */
export interface AudioInput {
  bytes: Uint8Array;
  name: string;
  /** MIME 型（audio/webm など） */
  type: string;
}

/** この Mac で起こすときに渡す値（language は "auto" なら自動で判別） */
export interface LocalOptions {
  whisper: string;
  ffmpeg: string;
  /** モデルのファイル */
  model: string;
  language: string;
}

/** macOS の音声認識で起こすときに渡す値（language は設定の値のまま。"auto" は Mac の言語） */
export interface MacosOptions {
  /** 補助コマンド（kickoff-speech）の場所 */
  helper: string;
  language: string;
}

/** OpenAI（互換のサーバーも）で起こすときに渡す値 */
export interface OpenAiOptions {
  key: string;
  /** 空なら https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  language: string;
}

/** 文字起こしの方法ごとの処理と、OpenAI の読み上げ（テストでは偽物に差し替える） */
export interface TranscribeEngines {
  local: (audio: AudioInput, opts: LocalOptions) => Promise<string>;
  openai: (audio: AudioInput, opts: OpenAiOptions) => Promise<string>;
  speech: (text: string, opts: SpeechOptions) => Promise<Uint8Array>;
}
