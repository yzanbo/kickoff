// DB クライアントの取り決め: キーチェーンで開けないと 409 でパスワードを聞くのは、つなぐ 14 本（作業場所を解くルート）
import assert from "node:assert/strict";
import { test } from "vitest";
import { databaseContract } from "./contract";

test("DB の取り決め: つなぐ 14 本は作業場所を解き、409 でパスワードを聞く", () => {
  const routes = Object.entries(databaseContract);
  const locked = routes.filter(([, spec]) => "marks" in spec && spec.marks?.locked).map(([key]) => key.slice(key.lastIndexOf("/") + 1));
  assert.deepEqual(locked.sort(), ["count", "databases", "definition", "edits", "er", "full-row", "objects", "outline", "rows", "schemas", "sql", "sql-assist", "table", "test"]);
  const workdir = routes.filter(([, spec]) => "workdir" in spec && spec.workdir).map(([key]) => key.slice(key.lastIndexOf("/") + 1));
  assert.deepEqual(workdir.sort(), locked.sort());
});
