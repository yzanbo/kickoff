import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { WHISPER_MODEL_IDS } from "../../voice/models.js";
import { EFFORT_LEVELS, PERMISSION_MODES, PROVIDER_IDS, VOICE_PROVIDERS, type AppSettings } from "@shared/types";
import { voiceLanguage, jsonBody } from "./schemas.js";

const settingsSchema = z
  .object({
    default_provider: z.enum(PROVIDER_IDS),
    remote_enabled: z.boolean(),
    ntfy_url: z.union([z.literal(""), z.url()]),
    desktop_notifications: z.boolean(),
    projects_dir: z.string().min(1).max(500),
    // 送った内容で置き換える（4 つとも送る）
    chat_defaults: z.object({
      model: z.string().min(1).max(100),
      effort: z.enum(EFFORT_LEVELS).nullable(),
      permission_mode: z.enum(PERMISSION_MODES),
      fast_mode: z.boolean(),
    }),
    auto_archive_days: z.number().int().min(1).max(365).nullable(),
    auto_resume_on_reconnect: z.boolean(),
    voice_enabled: z.boolean(),
    voice_provider: z.enum(VOICE_PROVIDERS),
    voice_language: voiceLanguage,
    voice_model: z.enum(WHISPER_MODEL_IDS),
    voice_openai_base_url: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
    voice_openai_model: z.string().trim().min(1).max(100),
  })
  .partial()
  .strict() satisfies z.ZodType<Partial<AppSettings>>;

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変える） */
export function settingsRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/settings", (c) => c.json(store.settings.get()));
  app.put("/api/settings", async (c) => c.json(store.settings.update(settingsSchema.parse(await jsonBody(c)))));
}
