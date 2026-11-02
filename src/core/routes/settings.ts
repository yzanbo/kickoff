import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES, PROVIDER_IDS } from "../types.js";

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
  })
  .partial();

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変える） */
export function settingsRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/settings", (c) => c.json(store.getSettings()));
  app.put("/api/settings", async (c) => c.json(store.updateSettings(settingsSchema.parse(await c.req.json()))));
}
