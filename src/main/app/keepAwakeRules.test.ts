import assert from "node:assert/strict";
import { test } from "node:test";
import { keepAwakeReason } from "./keepAwakeRules.js";

test("keepAwakeReason: 作業中なら眠らせない（バッテリーでも）。スマホ連携がオンで電源につないでいる間も眠らせない", () => {
  assert.equal(keepAwakeReason({ running: 1, mobileEnabled: false, onBattery: true }), "working");
  assert.equal(keepAwakeReason({ running: 0, mobileEnabled: true, onBattery: false }), "mobile");
  assert.equal(keepAwakeReason({ running: 0, mobileEnabled: true, onBattery: true }), null);
  assert.equal(keepAwakeReason({ running: 0, mobileEnabled: false, onBattery: false }), null);
});
