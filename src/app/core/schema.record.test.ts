import { test } from "vitest";
import { openDb } from "@/foundation/core/db/db";
import { matchRecord } from "@/foundation/core/testing/record";
import { MIGRATIONS } from "./migrations";
import { MEMORY_DB } from "@/foundation/core/testing/memoryDb";

test("スキーマの記録（表・索引・トリガー・ビューの作る文と、印と版。作り直すまで変わらない）", async () => {
  const db = openDb(MEMORY_DB, MIGRATIONS);
  try {
    const pragma = (name: string) => Object.values(db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[0];
    const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as { sql: string | null }[];
    // 自動の索引（sql が null）は飛ばし、字下げの違いで記録を変えないよう連続する空白を 1 つにまとめる
    const statements = rows.flatMap((r) => (r.sql === null ? [] : [`${r.sql.replace(/\s+/g, " ").trim()};`]));
    const text = [`-- application_id: ${pragma("application_id")}`, `-- user_version: ${pragma("user_version")}`, ...statements].join("\n");
    await matchRecord("core/schema.sql", `${text}\n`);
  } finally {
    db.close();
  }
});
