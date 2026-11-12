import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalHost, sameLocalServer } from "./dbServer";

test("isLocalHost: 書いていない・localhost・127.x・Docker から見た Mac はこの Mac の中", () => {
  for (const h of [null, "localhost", "LOCALHOST", "127.0.0.1", "127.1.2.3", "::1", "0.0.0.0", "host.docker.internal"]) assert.equal(isLocalHost(h), true, String(h));
  for (const h of ["db", "db.example.com", "10.0.0.1"]) assert.equal(isLocalHost(h), false, h);
});

test("sameLocalServer: 種類・この Mac の中のホスト・ポート（書いていなければ既定）が同じ", () => {
  const pg = { engine: "postgres" as const, host: "localhost", port: 5432 };
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "127.0.0.1", port: null }), true);
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "localhost", port: 5433 }), false);
  assert.equal(sameLocalServer(pg, { engine: "mysql", host: "localhost", port: 5432 }), false);
  assert.equal(sameLocalServer(pg, { engine: "postgres", host: "db.example.com", port: 5432 }), false);
  assert.equal(sameLocalServer({ engine: "sqlite", host: null, port: null }, { engine: "sqlite", host: null, port: null }), false);
});
