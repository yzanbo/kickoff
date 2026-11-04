import type { AppSettings } from "@shared/types";
import { findWhisperModel } from "./models.js";
import { INSTALL_HINT, type VoiceTools } from "./tools.js";

/** 準備の確かめに使う値 */
export interface ReadinessInput {
  settings: Pick<AppSettings, "voice_enabled" | "voice_provider" | "voice_model">;
  tools: VoiceTools;
  /** 選んでいるモデルを落としてあるか */
  modelDownloaded: boolean;
  keySaved: boolean;
}

/** いまの設定で文字起こしできないときの理由（できるなら null） */
export function voiceUnreadyReason({ settings, tools, modelDownloaded, keySaved }: ReadinessInput): string | null {
  if (!settings.voice_enabled) return "音声入力がオフです。設定の「音声入力」でオンにしてください。";
  if (settings.voice_provider === "openai") {
    return keySaved ? null : "OpenAI の API キーがありません。設定の「音声入力」で保存してください。";
  }
  const missing = [!tools.whisper && "whisper-cli", !tools.ffmpeg && "ffmpeg"].filter(Boolean);
  if (missing.length > 0) return `${missing.join(" と ")} が見つかりません。${INSTALL_HINT}`;
  const model = findWhisperModel(settings.voice_model);
  if (!model) return "文字起こしのモデルを選んでください。";
  if (!modelDownloaded) return `文字起こしのモデル（${model.label}）をダウンロードしてください。`;
  return null;
}
