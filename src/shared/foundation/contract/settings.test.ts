import { test } from "vitest";
import assert from "node:assert/strict";
import { defaultsOf, entriesOf, setting } from "./settings";

const table = {
  enabled: setting({ default: true }),
  name: setting<string | null>({ default: null }),
  perAi: setting<Record<string, { model: string | null }>>({ default: { a: { model: null } }, entries: true }),
};

test("設定の宣言: 既定の値は表の並びのまま、中の項目ごとに重ねるのは entries の項目だけ", () => {
  assert.deepEqual(defaultsOf(table), { enabled: true, name: null, perAi: { a: { model: null } } });
  assert.deepEqual(Object.keys(defaultsOf(table)), ["enabled", "name", "perAi"]);
  assert.deepEqual(entriesOf(table), ["perAi"]);
  assert.deepEqual(entriesOf({ enabled: table.enabled }), []);
});
