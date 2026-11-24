import type { Hono } from "hono";
import { z } from "zod";
import type { Kernel } from "@/foundation/core/kernel";
import type { AppSettings, SettingsPatch } from "@shared/foundation/contract/settings";
import { jsonBody } from "@/foundation/core/http/input";

/** 設定の PUT の項目ごとの zod（全部の項目。組み立てが機能の core/settings.ts を束ねて渡す = @/app/core/settings.ts） */
export type SettingSchemas = { [K in keyof SettingsPatch]-?: z.ZodType<Exclude<SettingsPatch[K], undefined>> };

/** 利用者が設定を変えるときに上の機能が挟む処理 */
export interface SettingsUpdateHook {
  /** 保存する前（throw すれば何も変えずに断る。HTTP のエラーはそのまま応答になる） */
  before?(patch: SettingsPatch, current: AppSettings): void;
  /** 保存したあと（応答の前に待つ。失敗しても設定は戻さないので、中で受け止める） */
  after?(next: AppSettings, previous: AppSettings): Promise<void>;
}

/** アプリ全体の設定（設定ダイアログ。送った項目だけを変え、知らない項目は 400） */
export function settingsRoutes(app: Hono, { settings, schemas, hooks }: { settings: Kernel["settings"]; schemas: SettingSchemas; hooks: readonly SettingsUpdateHook[] }) {
  const patch = z.object(schemas).partial().strict();
  app.get("/api/settings", (c) => c.json(settings.get()));
  app.put("/api/settings", async (c) => {
    const input = patch.parse(await jsonBody(c));
    const previous = settings.get();
    for (const hook of hooks) hook.before?.(input, previous);
    const next = settings.update(input);
    for (const hook of hooks) await hook.after?.(next, previous);
    return c.json(next);
  });
}
