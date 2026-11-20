import type { Hono } from "hono";
import { z } from "zod";
import type { Kernel } from "@/foundation/core/kernel";
import type { SettingsPatch } from "@shared/foundation/contract/settings";
import { jsonBody } from "@/foundation/core/http/input";

/** 設定の PUT の項目ごとの zod（全部の項目。組み立てが機能の core/settings.ts を束ねて渡す = @/app/core/settings.ts） */
export type SettingSchemas = { [K in keyof SettingsPatch]-?: z.ZodType<Exclude<SettingsPatch[K], undefined>> };

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変え、知らない項目は 400） */
export function settingsRoutes(app: Hono, { settings, schemas }: { settings: Kernel["settings"]; schemas: SettingSchemas }) {
  const patch = z.object(schemas).partial().strict();
  app.get("/api/settings", (c) => c.json(settings.get()));
  app.put("/api/settings", async (c) => c.json(settings.update(patch.parse(await jsonBody(c)))));
}
