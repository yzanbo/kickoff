import type { DevicePush } from "@shared/devices/types";
import { NOW } from "@/foundation/core/db/db";
import { col, table } from "@/foundation/core/db/table";

/**
 * スマホ連携の端末（v1）。トークンは hash だけを置く（本物は端末にだけある）。access は full = 使える / read = 見るだけ。
 * push はプッシュの宛先（Expo のトークン・Web Push の購読。外に出さない）
 */
export const DEVICES_SCHEMA_V1 = `
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (name <> ''),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash <> ''),
  access TEXT NOT NULL DEFAULT 'full' CHECK (access <> ''),
  push TEXT CHECK (push IS NULL OR (json_valid(push) AND json_type(push) = 'object')),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  last_used_at TEXT
) STRICT;
`;

/** devices の表の列（トークンの hash は店の中だけ。端末の型 Device には、push の代わりに has_push を出す） */
export const devicesTable = table("devices", {
  id: col.int(),
  name: col.text(),
  token_hash: col.text().hidden(),
  access: col.text(),
  push: col.json<DevicePush>().nullable(),
  created_at: col.time(),
  last_used_at: col.time().nullable(),
}, { order: "id" });
