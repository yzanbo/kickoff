import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { WHISPER_MODEL_IDS } from "../../voice/models.js";
import { AI_CHILD_CHAT_MODES, OPENAI_TTS_VOICES, PROVIDER_IDS, VOICE_PROVIDERS, VOICE_TTS_PROVIDERS, VOICE_TTS_RATE_MAX, VOICE_TTS_RATE_MIN, type AppSettings } from "@shared/types";
import { AUTO_COMPACT_PCT_MAX, AUTO_COMPACT_PCT_MIN } from "@shared/chat/autoCompact";
import { jsonBody } from "../input.js";
import { ABSOLUTE_FOLDER, chatDefaultsSchema, isAbsoluteFolder, compactPrompt, voiceLanguage } from "./schemas.js";

const settingsSchema = z
  .object({
    default_provider: z.enum(PROVIDER_IDS),
    remote_enabled: z.boolean(),
    ntfy_url: z.union([z.literal(""), z.url()]),
    desktop_notifications: z.boolean(),
    dock_badge: z.boolean(),
    projects_dir: z.string().min(1).max(500),
    // 送った内容で置き換える（4 つとも送る）
    chat_defaults: chatDefaultsSchema,
    auto_archive_days: z.number().int().min(1).max(365).nullable(),
    auto_resume_on_reconnect: z.boolean(),
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
    // メモの親フォルダ（null なら既定の場所）
    memos_dir: z.string().trim().min(1).max(1000).refine(isAbsoluteFolder, ABSOLUTE_FOLDER).nullable(),
    // 自動圧縮を始める使用率（null なら Claude Code の既定）
    auto_compact_pct: z.number().int().min(AUTO_COMPACT_PCT_MIN).max(AUTO_COMPACT_PCT_MAX).nullable(),
    // 共通の圧縮前指示（null ならなし）
    pre_compact_prompt: compactPrompt,
    post_compact_prompt: compactPrompt,
    // 共通の圧縮前指示・圧縮後指示を送るか（オフでも文は残す）
    pre_compact_enabled: z.boolean(),
    post_compact_enabled: z.boolean(),
    // チャットの AI が自分の子チャットを作るとき（毎回聞く / 聞かずに作る / 作らせない）
    ai_child_chat: z.enum(AI_CHILD_CHAT_MODES),
  })
  .partial()
  .strict() satisfies z.ZodType<Partial<AppSettings>>;

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変える） */
export function settingsRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/settings", (c) => c.json(store.settings.get()));
  app.put("/api/settings", async (c) => c.json(store.settings.update(settingsSchema.parse(await jsonBody(c)))));
}
