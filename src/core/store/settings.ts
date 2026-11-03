import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, type AppSettings } from "../types.js";
import type { Notify } from "./common.js";

/** アプリ全体の設定（settings 表。キーごとに JSON で持ち、既定とマージして返す） */
export function createSettingsStore(db: DatabaseSync, onChange: Notify) {
  const get = (): AppSettings => {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  };
  return {
    get,
    update(patch: Partial<AppSettings>): AppSettings {
      const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) stmt.run(key, JSON.stringify(value));
      }
      const settings = get();
      onChange({ type: "settings", settings });
      return settings;
    },
  };
}
