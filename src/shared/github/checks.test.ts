import assert from "node:assert/strict";
import { test } from "vitest";
import { checkDetail, ciStateOf, commitStatusState, rollupStateOf } from "./checks";

test("ciStateOf: 終わっていなければ実行中、終わっていれば conclusion から（時間切れ・起動の失敗・対応が要るも落ちた。大文字も同じ）", () => {
  assert.equal(ciStateOf("in_progress", null), "pending");
  assert.equal(ciStateOf("QUEUED", null), "pending");
  assert.equal(ciStateOf("completed", "success"), "success");
  assert.equal(ciStateOf("COMPLETED", "FAILURE"), "failure");
  for (const c of ["timed_out", "startup_failure", "action_required"]) assert.equal(ciStateOf("completed", c), "failure");
  assert.equal(ciStateOf("completed", "cancelled"), "cancelled");
  assert.equal(ciStateOf("completed", "skipped"), "skipped");
  for (const c of ["neutral", "stale", "なにか", null]) assert.equal(ciStateOf("completed", c), "neutral");
});

test("commitStatusState・rollupStateOf: error は落ちた、expected は待ち。まとめの知らない値は null", () => {
  assert.deepEqual(["success", "error", "FAILURE", "pending", "EXPECTED"].map(commitStatusState), ["success", "failure", "failure", "pending", "pending"]);
  assert.deepEqual(["SUCCESS", "ERROR", "FAILURE", "PENDING", "EXPECTED", "x", null].map(rollupStateOf), ["success", "failure", "failure", "pending", "pending", null, null]);
});

test("checkDetail: 時間切れ・対応が要るは添え書き、状態の名前で足りるものは null、知らない値はそのまま", () => {
  assert.equal(checkDetail("TIMED_OUT"), "時間切れ");
  assert.equal(checkDetail("action_required"), "対応が要る");
  for (const c of ["success", "failure", "startup_failure", "cancelled", "skipped", "neutral", null]) assert.equal(checkDetail(c), null);
  assert.equal(checkDetail("STALE"), "stale");
});
