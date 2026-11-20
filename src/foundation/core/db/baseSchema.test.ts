import assert from "node:assert/strict";
import { test } from "vitest";
import { createSecretStore } from "@/foundation/core/settings/secretStore";
import { createSettingsStore } from "@/foundation/core/settings/settingsStore";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { BASE_SCHEMA_V1 } from "./baseSchema";
import { openDb, readDatabaseId } from "./db";

// 土台の表（設定・秘密の値・meta）とその店（settings の店は何の設定かを知らないので、例の形で確かめる）

/** 土台の表だけの DB（メモリ） */
function baseDb() {
  const db = openDb(":memory:", [{ version: 1, sql: BASE_SCHEMA_V1 }]);
  afterTest(() => db.close());
  return db;
}

interface Example {
  mode: "a" | "b";
  tags: string[];
  byName: Record<"x" | "y", { size: number; on: boolean }>;
}
const DEFAULTS: Example = { mode: "a", tags: [], byName: { x: { size: 1, on: false }, y: { size: 2, on: false } } };
type ExamplePatch = Partial<Omit<Example, "byName">> & { byName?: Partial<Example["byName"]> };

test("設定: 既定と混ぜ、知らないキーは返さない。entries は中の項目ごとに既定へ重ね、変えるのは送った中の項目だけ", () => {
  const db = baseDb();
  const sent: Example[] = [];
  const settings = createSettingsStore<Example, ExamplePatch>(db, DEFAULTS, (s) => sent.push(s), ["byName"]);
  db.prepare("INSERT INTO settings (key, value) VALUES ('old_key', '1'), ('byName', ?)").run(JSON.stringify({ x: { size: 5 }, z: { size: 9 } }));
  assert.deepEqual(settings.get(), { mode: "a", tags: [], byName: { x: { size: 5, on: false }, y: { size: 2, on: false } } });
  const saved = settings.update({ mode: "b", tags: ["t"], byName: { y: { size: 3, on: true } } });
  assert.deepEqual(saved, { mode: "b", tags: ["t"], byName: { x: { size: 5, on: false }, y: { size: 3, on: true } } });
  assert.deepEqual(sent, [saved]);
  // entries でない項目は丸ごと置き換える
  assert.deepEqual(settings.update({ tags: [] }).tags, []);
});

test("秘密の値: 置く・読む・空で消す。DB の ID は作ったときに決まる", () => {
  const db = baseDb();
  const secrets = createSecretStore<"k1" | "k2">(db);
  assert.equal(secrets.get("k1"), null);
  secrets.set("k1", "v");
  assert.equal(secrets.get("k1"), "v");
  secrets.set("k1", "");
  assert.equal(secrets.get("k1"), null);
  assert.match(readDatabaseId(db), /^[0-9a-f]{32}$/);
  assert.notEqual(readDatabaseId(baseDb()), readDatabaseId(db));
});
