// 音声入力・音声モード・読み上げの設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";
import type { VoiceProvider, VoiceTtsProvider } from "./types";

export const voiceSettings = {
  /** チャット欄の音声入力（マイクのボタン）を使うか */
  voice_enabled: setting({ default: false }),
  /** 文字起こしの方法（この Mac / OpenAI） */
  voice_provider: setting<VoiceProvider>({ default: "local" }),
  /** 話す言語（"auto" なら自動で判別。VOICE_LANGUAGES） */
  voice_language: setting({ default: "ja" }),
  /** この Mac で使う whisper のモデルの id（voice のコアの models.ts の WHISPER_MODELS） */
  voice_model: setting({ default: "large-v3-turbo-q5_0" }),
  /** OpenAI 互換のサーバーの URL（空なら https://api.openai.com/v1）。API キーは設定とは別に保存し、ここには入れない */
  voice_openai_base_url: setting({ default: "" }),
  /** OpenAI の文字起こしのモデル */
  voice_openai_model: setting({ default: "gpt-4o-transcribe" }),
  /** 音声モードで返答を読み上げる方法（この Mac の声 / OpenAI の声） */
  voice_tts_provider: setting<VoiceTtsProvider>({ default: "system" }),
  /** この Mac の声の名前（空なら話す言語の既定の声） */
  voice_tts_voice: setting({ default: "" }),
  /** OpenAI の声（OPENAI_TTS_VOICES） */
  voice_tts_openai_voice: setting({ default: "coral" }),
  /** 読み上げの速さ（1 が標準。VOICE_TTS_RATE_MIN〜MAX） */
  voice_tts_rate: setting({ default: 1 }),
} as const satisfies SettingTable;
