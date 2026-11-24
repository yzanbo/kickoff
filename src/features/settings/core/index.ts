// 設定の機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { settingsRoutes, type SettingSchemas, type SettingsUpdateHook } from "./routes/settings";

export type { SettingsUpdateHook } from "./routes/settings";

/** 設定の口（上の機能が登録する。設定は一番下の機能なので、上の力は登録で受ける） */
export interface SettingsApi {
  /** 利用者が設定を変える前と後（notes が登録: 共通のノートのフォルダが変わるなら、作業中のチャットを確かめて断る・付け替える） */
  onUpdate(hook: SettingsUpdateHook): void;
}

/** アプリ全体の設定のルート（値は土台の k.settings。項目ごとの zod は組み立てが全部の機能の分を渡す） */
export function createSettings(k: Pick<Kernel, "settings">, env: { schemas: SettingSchemas }): CoreFeature<SettingsApi> {
  const hooks: SettingsUpdateHook[] = [];
  return {
    name: "settings",
    api: { onUpdate: (hook) => void hooks.push(hook) },
    routes: [{ legacy: (app) => settingsRoutes(app, { settings: k.settings, schemas: env.schemas, hooks }) }],
  };
}
