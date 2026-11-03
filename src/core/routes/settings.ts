import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { WHISPER_MODEL_IDS } from "../transcribe/models.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES, PROVIDER_IDS, VOICE_PROVIDERS } from "../types.js";
import { voiceLanguage } from "./schemas.js";

const settingsSchema = z
  .object({
    maxConcurrentRuns: z.number().int().min(1).max(8).nullable(),
    defaultProvider: z.enum(PROVIDER_IDS),
    remoteEnabled: z.boolean(),
    ntfyUrl: z.union([z.literal(""), z.url()]),
    desktopNotifications: z.boolean(),
    projectsDir: z.string().min(1).max(500),
    claudeModel: z.string().min(1).max(100),
    defaultEffort: z.enum(EFFORT_LEVELS).nullable(),
    defaultPermission: z.enum(PERMISSION_CHOICES),
    defaultFastMode: z.boolean(),
    autoArchiveDays: z.number().int().min(1).max(365).nullable(),
    voiceEnabled: z.boolean(),
    voiceProvider: z.enum(VOICE_PROVIDERS),
    voiceLanguage,
    voiceModel: z.enum(WHISPER_MODEL_IDS),
    voiceOpenaiBaseUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
    voiceOpenaiModel: z.string().trim().min(1).max(100),
  })
  .partial();

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変える） */
export function settingsRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/settings", (c) => c.json(store.getSettings()));
  app.put("/api/settings", async (c) => c.json(store.updateSettings(settingsSchema.parse(await c.req.json()))));
}
