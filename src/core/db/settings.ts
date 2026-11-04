import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, type AppSettings } from "@shared/types";
import type { Notify } from "./common.js";

/** 秘密の値の名前（secrets の表） */
export type SecretKey = "openai_transcribe_key";

/** アプリ全体の設定（settings の表。キーごとに JSON で持ち、既定とマージして返す） */
export function createSettingsStore(db: DatabaseSync, onChange: Notify) {
  const get = (): AppSettings => {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    // 知らないキー（なくした設定）は返さない
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)])) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...stored, chat_defaults: { ...DEFAULT_SETTINGS.chat_defaults, ...stored.chat_defaults } };
  };
  return {
    get,
    /** 送った項目だけを変える（chat_defaults は丸ごと置き換える） */
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

/** 秘密の値（API キーなど。secrets の表。設定の一覧・画面への配信には含めない） */
export function createSecretStore(db: DatabaseSync) {
  return {
    /** なければ null */
    get(key: SecretKey): string | null {
      const row = db.prepare("SELECT value FROM secrets WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    /** 保存する（空なら消す） */
    set(key: SecretKey, value: string) {
      if (value) db.prepare("INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
      else db.prepare("DELETE FROM secrets WHERE key = ?").run(key);
    },
  };
}

/** DB を作ったときに決めた ID（meta の表。画面が覚えている ID 入りの表示の状態を、DB を作り直したら捨てる目印） */
export function readDatabaseId(db: DatabaseSync): string {
  return (db.prepare("SELECT value FROM meta WHERE key = 'database_id'").get() as { value: string }).value;
}
