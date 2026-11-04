import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent } from "@shared/types";
import { failedTurnOf, lowerEffort } from "./retryActions";

const ev = (id: number, type: ChatEvent["type"], data: object): ChatEvent => ({ id, chat_id: 1, type, data, created_at: "2026-11-04T00:00:00Z" }) as unknown as ChatEvent;

test("失敗の直す操作: いちばん新しい作業が失敗で終わったときだけ（通信の切断・使用枠の上限・そのあと発言したものは除く）", () => {
  const base = [ev(1, "user", { text: "直して" }), ev(2, "text", { text: "…" })];
  assert.deepEqual(failedTurnOf([...base, ev(3, "result", { status: "failed", text: "API Error: 500" })]), { resultId: 3, prompt: { eventId: 1, text: "直して" } });
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "completed" })]), undefined);
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "cancelled" })]), undefined);
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "failed", network: true })]), undefined);
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "failed", text: "Claude AI usage limit reached", usage_limit: { resets_at: null } })]), undefined);
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "failed" }), ev(4, "user", { text: "次" })]), undefined);
  // 終わりのあとのお知らせは見ない
  assert.equal(failedTurnOf([...base, ev(3, "result", { status: "failed" }), ev(4, "notice", { message: "…" })])?.resultId, 3);
});

test("失敗の直す操作: 推論の深さを 1 段下げる（選べるものの中で。決まっていなければ既定から、既定も分からなければ中）", () => {
  const all = ["low", "medium", "high", "xhigh", "max"] as const;
  assert.equal(lowerEffort("high", null, all), "medium");
  assert.equal(lowerEffort("low", null, all), undefined);
  assert.equal(lowerEffort(null, "xhigh", all), "high");
  assert.equal(lowerEffort(null, null, all), "medium");
  assert.equal(lowerEffort("max", null, ["low", "high", "max"]), "high");
});
