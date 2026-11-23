import assert from "node:assert/strict";
import { test } from "vitest";
import type { SqlStatement } from "@shared/database/sqlStatements";
import { skipRest } from "./skipRest";

const statements: SqlStatement[] = ["select 1", "select 2", "select 3"].map((text, i) => ({ text, start: i * 10, end: i * 10 + 8 }));

test("skipRest: 失敗・止めた文のあとの文を、流したときの様子で「流していません」にする", () => {
  assert.deepEqual(skipRest(statements, [{ sql: "select 1", write: true, error: "x" }], true), [
    { sql: "select 1", write: true, error: "x" },
    { sql: "select 2", write: true, skipped: true },
    { sql: "select 3", write: true, skipped: true },
  ]);
  assert.deepEqual(skipRest(statements, [{ sql: "select 1", write: false }, { sql: "select 2", write: false, stopped: true }], false), [
    { sql: "select 1", write: false },
    { sql: "select 2", write: false, stopped: true },
    { sql: "select 3", write: false, skipped: true },
  ]);
});

test("skipRest: 最後の文が通った・残りがなければ足さない", () => {
  const ok = [{ sql: "select 1", write: false }];
  assert.deepEqual(skipRest(statements, ok, false), ok);
  assert.deepEqual(skipRest(statements, [], false), []);
  const last = [...statements.slice(0, 2).map((s) => ({ sql: s.text, write: false })), { sql: "select 3", write: false, error: "x" }];
  assert.deepEqual(skipRest(statements, last, false), last);
});
