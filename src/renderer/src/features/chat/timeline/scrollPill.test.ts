import assert from "node:assert/strict";
import { test } from "node:test";
import { scrollPillOf } from "./scrollPill";

const base = { waiting: false, reconnecting: false, finishedWhileAway: false, busy: false, retrying: false, failed: false, working: "考えています", statusLabel: "完了" };

test("scrollPillOf: 答えを待っているのがいちばん先。次に、つながるのを待っている（作業していないとき）", () => {
  assert.deepEqual(scrollPillOf({ ...base, waiting: true, busy: true, finishedWhileAway: true }), { label: "回答を待っています", tone: "waiting" });
  assert.equal(scrollPillOf({ ...base, reconnecting: true }).tone, "offline");
  assert.equal(scrollPillOf({ ...base, reconnecting: true, busy: true }).tone, "working");
});

test("scrollPillOf: 上を読んでいる間に終わったら、返答が届いた・失敗したで目立たせる", () => {
  assert.deepEqual(scrollPillOf({ ...base, finishedWhileAway: true }), { label: "返答が届きました", tone: "arrived" });
  assert.deepEqual(scrollPillOf({ ...base, finishedWhileAway: true, failed: true }), { label: "失敗しました", tone: "failed" });
});

test("scrollPillOf: 作業中は作業中の行と同じ文（再試行中は黄）。終わっていればチャットの状態", () => {
  assert.deepEqual(scrollPillOf({ ...base, busy: true }), { label: "考えています", tone: "working" });
  assert.equal(scrollPillOf({ ...base, busy: true, retrying: true }).tone, "offline");
  assert.deepEqual(scrollPillOf(base), { label: "完了", tone: "idle" });
  assert.deepEqual(scrollPillOf({ ...base, failed: true, statusLabel: "失敗" }), { label: "失敗", tone: "failed" });
});
