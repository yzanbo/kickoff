// 音声の設定の PUT の zod（表は @shared/voice/settings）
import { z } from "zod";
import { defineSettingSchemas } from "@/foundation/core/settings/defineSettingSchemas";
import { voiceLanguage } from "@/foundation/core/http/schemas";
import { voiceSettings } from "@shared/voice/settings";
import { OPENAI_TTS_VOICES, VOICE_PROVIDERS, VOICE_TTS_PROVIDERS, VOICE_TTS_RATE_MAX, VOICE_TTS_RATE_MIN } from "@shared/voice/types";
import { WHISPER_MODEL_IDS } from "./models";

export const voiceSettingSchemas = defineSettingSchemas(voiceSettings, {
  voice_enabled: z.boolean(),
  voice_provider: z.enum(VOICE_PROVIDERS),
  voice_language: voiceLanguage,
  voice_model: z.enum(WHISPER_MODEL_IDS),
  voice_openai_base_url: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
  voice_openai_model: z.string().trim().min(1).max(100),
  // 音声モードの読み上げ（声の名前は空ならその言語の既定の声）
  voice_tts_provider: z.enum(VOICE_TTS_PROVIDERS),
  voice_tts_voice: z.string().trim().max(200),
  voice_tts_openai_voice: z.enum(OPENAI_TTS_VOICES),
  voice_tts_rate: z.number().min(VOICE_TTS_RATE_MIN).max(VOICE_TTS_RATE_MAX),
});
