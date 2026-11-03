import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate, schemaVersion } from "./schema.js";
import { createLegacyV17 } from "./testing/legacySchemaV17.js";

/** 表ごとの列（順・型・NOT NULL・既定・主キー）・外部キー・索引（列と UNIQUE か） */
function shapeOf(db: DatabaseSync) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return tables.map(({ name }) => ({
    name,
    columns: db.prepare(`PRAGMA table_xinfo(${name})`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(${name})`).all().map(({ id: _id, seq: _seq, ...fk }) => fk),
    indexes: (db.prepare(`PRAGMA index_list(${name})`).all() as { name: string; unique: number; origin: string }[])
      .map((ix) => ({ ...ix, columns: db.prepare(`PRAGMA index_info(${ix.name})`).all().map((c) => c.name) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

test("古い v17 のスキーマの写しは、以前の MIGRATIONS を順に流した DB と同じ表になる", () => {
  const migrated = new DatabaseSync(":memory:");
  migrate(migrated);
  const legacy = new DatabaseSync(":memory:");
  createLegacyV17(legacy);
  assert.equal(schemaVersion(migrated), 17);
  assert.equal(schemaVersion(legacy), 17);
  assert.deepEqual(shapeOf(legacy), shapeOf(migrated));
});
