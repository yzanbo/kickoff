// 秘密の値の店（secrets の表。API キー・DB のパスワードなど。設定の一覧・SSE・API の応答には出さない。暗号化は置く側が system/sealedSecret.ts で）
import type { DatabaseSync } from "node:sqlite";

export interface SecretStore<K extends string> {
  /** なければ null */
  get(key: K): string | null;
  /** 保存する（空なら消す） */
  set(key: K, value: string): void;
}

/** 秘密の値の店を作る（キーの形 K は使う側が決める） */
export function createSecretStore<K extends string>(db: Pick<DatabaseSync, "prepare">): SecretStore<K> {
  const select = db.prepare("SELECT value FROM secrets WHERE key = ?");
  const upsert = db.prepare("INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const remove = db.prepare("DELETE FROM secrets WHERE key = ?");
  return {
    get(key) {
      const row = select.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    set(key, value) {
      if (value) upsert.run(key, value);
      else remove.run(key);
    },
  };
}
