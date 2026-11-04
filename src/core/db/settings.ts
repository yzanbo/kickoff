import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, type AppSettings } from "@shared/types";
import type { Notify } from "./common.js";

/** 秘密の値（API キーなど）のキーの頭。同じ表に置くが、設定（get・画面への配信）には含めない */
const SECRET_PREFIX = "secret:";

/** 秘密の値の名前 */
export type SecretKey = "openaiTranscribeKey";

/** アプリ全体の設定（settings 表。キーごとに JSON で持ち、既定とマージして返す） */
export function createSettingsStore(db: DatabaseSync, onChange: Notify) {
  const get = (): AppSettings => {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE ? || '%'").all(SECRET_PREFIX) as { key: string; value: string }[];
    // なくした設定（以前の版で保存したキー）は返さない
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)]));
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
    /** 秘密の値（なければ null。画面には返さない） */
    secret(key: SecretKey): string | null {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SECRET_PREFIX + key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as string) : null;
    },
    /** 秘密の値を保存する（空なら消す） */
    setSecret(key: SecretKey, value: string) {
      if (value) {
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SECRET_PREFIX + key, JSON.stringify(value));
      } else {
        db.prepare("DELETE FROM settings WHERE key = ?").run(SECRET_PREFIX + key);
      }
    },
  };
}
