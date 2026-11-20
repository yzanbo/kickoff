import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "./common";
import type { DbSecretKey } from "@/features/database/core/db/dbConnections";
import { createSecretStore, type SecretStore } from "@/foundation/core/settings/secretStore";
import { createSettingsStore, type SettingsStore } from "@/foundation/core/settings/settingsStore";
import { readDatabaseId } from "./db";
import { DEFAULT_SETTINGS, type AppSettings, type ProviderId, type SettingsPatch } from "@shared/settings/types";

/** 秘密の値の名前（secrets の表）: 音声入力の OpenAI のキー・DB の接続のパスワード（接続を消したら表のトリガーで消える）・AI の API キー */
export type SecretKey = "openai_transcribe_key" | DbSecretKey | `provider_api_key:${ProviderId}`;

/** 土台の店（設定・秘密の値・DB の ID）。Kernel が開く（設定の宣言を機能ごとにするまで、既定と鍵の形はここで決める） */
export interface BaseStores {
  readonly databaseId: string;
  readonly settings: SettingsStore<AppSettings, SettingsPatch>;
  readonly secrets: SecretStore<SecretKey>;
}

/** 土台の店を開く（設定は DEFAULT_SETTINGS と混ぜ、AI ごとの既定は AI ごとに重ねる） */
export function openBaseStores(db: DatabaseSync, onChange: Notify): BaseStores {
  return {
    databaseId: readDatabaseId(db),
    settings: createSettingsStore<AppSettings, SettingsPatch>(db, DEFAULT_SETTINGS, (settings) => onChange({ type: "settings", settings }), ["provider_chat_defaults"]),
    secrets: createSecretStore<SecretKey>(db),
  };
}
