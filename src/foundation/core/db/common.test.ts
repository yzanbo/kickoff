import assert from "node:assert/strict";
import { test } from "vitest";
import { memoryDb } from "@/foundation/core/testing/memoryDb";
import { pathOrInside } from "./common";

test("pathOrInside: そのパスとフォルダの中だけに当たる（絵文字の入ったパスでも。似た名前のフォルダには当たらない）", () => {
  const db = memoryDb();
  db.exec("CREATE TABLE t (p TEXT NOT NULL) STRICT");
  for (const p of ["📁a", "📁a/b.md", "📁a/c/d.md", "📁ab/e.md", "x.md"]) db.prepare("INSERT INTO t (p) VALUES (?)").run(p);
  const hits = (path: string) => {
    const inside = pathOrInside("p", path);
    return (db.prepare(`SELECT p FROM t WHERE ${inside.sql} ORDER BY p`).all(...inside.values) as { p: string }[]).map((r) => r.p);
  };
  assert.deepEqual(hits("📁a"), ["📁a", "📁a/b.md", "📁a/c/d.md"]);
  assert.deepEqual(hits("📁a/c"), ["📁a/c/d.md"]);
  assert.deepEqual(hits("x.md"), ["x.md"]);
});
