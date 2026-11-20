import assert from "node:assert/strict";
import { test } from "vitest";
import { assertGroups } from "@/foundation/ui/storage/groups";
import { storage as shellStorage } from "@/foundation/ui/storage/storage";
import { STORAGE_GROUPS } from "./storage";

const features = import.meta.glob<{ namespace: string }>("../../features/*/ui/storage.ts", { eager: true, import: "storage" });

test("STORAGE_GROUPS: 全部の群がそろい（機能の storage.ts・土台・残りの仮の群）、namespace もキーも重ならない", () => {
  assert.doesNotThrow(() => assertGroups(STORAGE_GROUPS));
  assert.ok(STORAGE_GROUPS.includes(shellStorage));
  for (const group of Object.values(features)) assert.ok(STORAGE_GROUPS.includes(group as never), group.namespace);
  assert.ok(Object.keys(features).length >= 20);
});

test("機能の storage.ts の namespace は機能のフォルダの名前", () => {
  for (const [file, group] of Object.entries(features)) assert.equal(group.namespace, file.split("/")[3], file);
});
