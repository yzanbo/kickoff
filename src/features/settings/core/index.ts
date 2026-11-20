// 設定の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { settingsRoutes, type SettingSchemas } from "./routes/settings";

/** アプリ全体の設定のルート（値は土台の k.settings。項目ごとの zod は組み立てが全部の機能の分を渡す） */
export function createSettings(k: Pick<Kernel, "settings">, env: { schemas: SettingSchemas }): CoreFeature<null> {
  return { name: "settings", api: null, routes: [{ legacy: (app) => settingsRoutes(app, { settings: k.settings, schemas: env.schemas }) }] };
}
