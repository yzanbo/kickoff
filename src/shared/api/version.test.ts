import assert from "node:assert/strict";
import { test } from "node:test";
import { apiMismatch } from "./version";

test("apiMismatch: アプリが本体の下限より古ければ client_too_old、本体がアプリの下限より古ければ host_too_old", () => {
  const host = { api_version: 2, min_client_api_version: 2 };
  assert.equal(apiMismatch({ api_version: 1, min_host_api_version: 1 }, host), "client_too_old");
  assert.equal(apiMismatch({ api_version: 3, min_host_api_version: 3 }, host), "host_too_old");
  assert.equal(apiMismatch({ api_version: 3, min_host_api_version: 2 }, host), null);
  assert.equal(apiMismatch({ api_version: 2, min_host_api_version: 1 }, host), null);
});
