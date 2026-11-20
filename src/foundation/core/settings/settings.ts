import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, PROVIDER_IDS, type AppSettings, type ProviderId, type SettingsPatch } from "@shared/settings/types";
import type { Notify } from "@/foundation/core/db/common";

/** 秘密の値の名前（secrets の表） */
export type SecretKey = "openai_transcribe_key" | DbSecretKey | ProviderSecretKey;
/** AI の API キー。暗号化して置く */
type ProviderSecretKey = `provider_api_key:${ProviderId}`;
/** DB の接続のパスワード（接続を消したら、表のトリガーで消える） */
export type DbSecretKey = `db_connection:${number}:password` | `db_connection:${number}:ai_password` | `db_connection:${number}:ssh_password`;

/** アプリ全体の設定（settings の表。キーごとに JSON で持ち、既定とマージして返す） */
export function createSettingsStore(db: DatabaseSync, onChange: Notify) {
  const get = (): AppSettings => {
    const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    // 知らないキーは返さない
    const stored = Object.fromEntries(rows.filter((r) => r.key in DEFAULT_SETTINGS).map((r) => [r.key, JSON.parse(r.value)])) as Partial<AppSettings>;
    // AI ごとの既定は、AI ごとに既定の上へ重ねる（書いていない AI・項目は既定）
    const chatDefaults = Object.fromEntries(PROVIDER_IDS.map((id) => [id, { ...DEFAULT_SETTINGS.provider_chat_defaults[id], ...stored.provider_chat_defaults?.[id] }]));
    return { ...DEFAULT_SETTINGS, ...stored, provider_chat_defaults: chatDefaults as AppSettings["provider_chat_defaults"] };
  };
  return {
    get,
    /** 送った項目だけを変える（キーの中は丸ごと置き換える。provider_chat_defaults は送った AI の分だけ） */
    update(patch: SettingsPatch): AppSettings {
      const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      const merged = patch.provider_chat_defaults ? { ...patch, provider_chat_defaults: { ...get().provider_chat_defaults, ...patch.provider_chat_defaults } } : patch;
      for (const [key, value] of Object.entries(merged)) {
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
