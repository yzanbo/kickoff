import assert from "node:assert/strict";
import { test } from "vitest";
import { assertGroups } from "@/foundation/ui/storage/groups";
import { DATABASE_ID } from "@/foundation/ui/storage/storageKeys";
import { STORAGE_GROUPS } from "./storage";

test("STORAGE_GROUPS: 全部の群がそろい（DB の ID も入る）、namespace もキーも重ならない", () => {
  assert.doesNotThrow(() => assertGroups(STORAGE_GROUPS));
  assert.ok(STORAGE_GROUPS.some((g) => Object.values(g.settings).includes(DATABASE_ID)));
  // storageKeys.ts の宣言はすべて仮の群に入る（0018 の P4-2b まで）
  assert.equal(STORAGE_GROUPS.reduce((n, g) => n + Object.keys(g.settings).length, 0), 155);
});
