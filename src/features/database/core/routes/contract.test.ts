// DB クライアントの取り決めと、いまの受け口が同じルートを持つか（受け口を取り決めに乗せ替えるまでの突き合わせ）
import assert from "node:assert/strict";
import { test } from "vitest";
import { databaseContract } from "@shared/database/contract";
import { splitKey } from "@shared/foundation/contract";
import { setup } from "@/app/core/testing/testServer";

/** パスの引数の名前をそろえる（取り決めは :projectId、受け口は :id など） */
const shape = (method: string, path: string) => `${method} ${path.replace(/:\w+/g, ":")}`;

test("DB の取り決め: いまの受け口と同じルート（どちらにもないものがない）・つなぐ 14 本は作業場所を解き、409 でパスワードを聞く", () => {
  const { app } = setup();
  const mounted = new Set(
    app.routes.filter((r) => r.method !== "ALL" && (r.path.includes("/db-connections") || r.path.endsWith("/docker/db"))).map((r) => shape(r.method, r.path)),
  );
  const declared = new Set(Object.keys(databaseContract).map((key) => shape(splitKey(key).method, splitKey(key).path)));
  assert.deepEqual([...declared].filter((k) => !mounted.has(k)), []);
  assert.deepEqual([...mounted].filter((k) => !declared.has(k)), []);
  const locked = Object.entries(databaseContract).filter(([, spec]) => "marks" in spec && spec.marks?.locked).map(([key]) => key.slice(key.lastIndexOf("/") + 1));
  assert.deepEqual(locked.sort(), ["count", "databases", "definition", "edits", "er", "full-row", "objects", "outline", "rows", "schemas", "sql", "sql-assist", "table", "test"]);
});
