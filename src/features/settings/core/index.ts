// 設定の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { settingsRoutes } from "./routes/settings";

/** アプリ全体の設定のルート（値は土台の k.settings） */
export function createSettings(k: Pick<Kernel, "settings">): CoreFeature<null> {
  return { name: "settings", api: null, routes: [{ legacy: (app) => settingsRoutes(app, { settings: k.settings }) }] };
}
