import assert from "node:assert/strict";
import { test } from "vitest";
import { isLocalHost } from "./net";

test("isLocalHost: 書いていない・localhost・127.x・Docker から見た Mac はこの Mac の中", () => {
  for (const h of [null, "localhost", "LOCALHOST", "127.0.0.1", "127.1.2.3", "::1", "0.0.0.0", "host.docker.internal"]) assert.equal(isLocalHost(h), true, String(h));
  for (const h of ["db", "db.example.com", "10.0.0.1"]) assert.equal(isLocalHost(h), false, h);
});
