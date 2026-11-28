import assert from "node:assert/strict";
import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";

test("更新の設定: 既定は自動で確かめる・飛ばした版なし。飛ばす版は semver の形だけを受け、null で戻せる", async () => {
  const { call } = setup({ features: ["settings"] });
  const defaults = (await call("GET", "/api/settings")).body;
  assert.equal(defaults.auto_check_updates, true);
  assert.equal(defaults.skipped_update_version, null);
  assert.equal((await call("PUT", "/api/settings", { skipped_update_version: "latest" })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { auto_check_updates: "no" })).status, 400);
  const saved = await call("PUT", "/api/settings", { skipped_update_version: "0.1.0-beta.2", auto_check_updates: false });
  assert.equal(saved.body.skipped_update_version, "0.1.0-beta.2");
  assert.equal(saved.body.auto_check_updates, false);
  assert.equal((await call("PUT", "/api/settings", { skipped_update_version: null })).body.skipped_update_version, null);
});
