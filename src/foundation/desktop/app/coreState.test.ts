// コアのプロセスの様子の移り変わり
import assert from "node:assert/strict";
import { test } from "vitest";
import { coreStateAfter } from "./coreState";

test("coreStateAfter: 起動 → ready ⇄ unresponsive、落ちたら restarting → ready / failed", () => {
  assert.equal(coreStateAfter("starting", "ready"), "ready");
  assert.equal(coreStateAfter("ready", "silent"), "unresponsive");
  assert.equal(coreStateAfter("unresponsive", "responded"), "ready");
  assert.equal(coreStateAfter("unresponsive", "waited"), "ready");
  assert.equal(coreStateAfter("ready", "restarting"), "restarting");
  assert.equal(coreStateAfter("restarting", "ready"), "ready");
  assert.equal(coreStateAfter("restarting", "gaveUp"), "failed");
  assert.equal(coreStateAfter("failed", "restarting"), "restarting");
});

test("coreStateAfter: 見張りの知らせは ready と unresponsive の間だけを動かす（起動中・作り直し中・止めたあとは変えない）", () => {
  for (const state of ["starting", "restarting", "failed"] as const) {
    assert.equal(coreStateAfter(state, "silent"), state);
    assert.equal(coreStateAfter(state, "responded"), state);
    assert.equal(coreStateAfter(state, "waited"), state);
  }
  assert.equal(coreStateAfter("unresponsive", "silent"), "unresponsive");
  assert.equal(coreStateAfter("ready", "responded"), "ready");
});
