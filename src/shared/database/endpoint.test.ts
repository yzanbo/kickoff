import assert from "node:assert/strict";
import { test } from "vitest";
import { sameLocalServer } from "./endpoint";

test("sameLocalServer: 種類・この Mac の中のホスト・ポート（書いていなければ既定）が同じ", () => {
  const pg = { engine: "postgres" as const, host: "localhost", port: 5432 };
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "127.0.0.1", port: null }), true);
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "localhost", port: 5433 }), false);
  assert.equal(sameLocalServer(pg, { engine: "mysql", host: "localhost", port: 5432 }), false);
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "db.example.com", port: 5432 }), false);
  assert.equal(sameLocalServer({ engine: "sqlite", host: null, port: null }, { engine: "sqlite", host: null, port: null }), false);
});
