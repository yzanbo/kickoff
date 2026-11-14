import assert from "node:assert/strict";
import { test } from "node:test";
import { API_VERSION, MIN_CLIENT_API_VERSION } from "@shared/api/version";
import { failureStateOf, helloStateOf, isFinal } from "./connection";

const hello = (patch: Record<string, unknown> = {}) => ({ core_version: "0.1.0", api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: "h1", ...patch });

test("helloStateOf: 版が通じて本体の ID が同じならつながる。いまの本体とアプリの組み合わせは通じる", () => {
  assert.deepEqual(helloStateOf(hello(), "h1"), { kind: "open" });
});

test("helloStateOf: 壊れずに断る — 本体が新しすぎればアプリの更新、古すぎる・版を知らせない本体なら Mac の Kickoff の更新、ほかの本体なら other_host", () => {
  assert.deepEqual(helloStateOf(hello({ api_version: 99, min_client_api_version: 99 }), "h1"), { kind: "mismatch", mismatch: "client_too_old" });
  assert.deepEqual(helloStateOf(hello({ api_version: 0, min_client_api_version: 0 }), "h1"), { kind: "mismatch", mismatch: "host_too_old" });
  assert.deepEqual(helloStateOf({ core_version: "0.0.1", host_id: "h1" }, "h1"), { kind: "mismatch", mismatch: "host_too_old" });
  assert.deepEqual(helloStateOf(null, "h1"), { kind: "mismatch", mismatch: "host_too_old" });
  assert.deepEqual(helloStateOf(hello({ host_id: "other" }), "h1"), { kind: "other_host" });
});

test("failureStateOf: 取り消し（401）・スマホ連携がオフ（403 mobile_off）・アプリが古い（426）を見分け、ほかはつなぎ直す", () => {
  assert.deepEqual(failureStateOf(401, { error: "unauthorized" }), { kind: "revoked" });
  assert.deepEqual(failureStateOf(403, { code: "mobile_off", error: "オフ" }), { kind: "mobile_off" });
  assert.deepEqual(failureStateOf(426, { code: "client_too_old" }), { kind: "mismatch", mismatch: "client_too_old" });
  assert.deepEqual(failureStateOf(502, null), { kind: "retrying", reason: "本体が 502 を返しました" });
  assert.equal(isFinal({ kind: "mismatch", mismatch: "host_too_old" }), true);
  assert.equal(isFinal({ kind: "mobile_off" }), false);
});
