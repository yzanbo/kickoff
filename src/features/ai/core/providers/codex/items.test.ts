// Codex の会話の項目 → Kickoff の記録（items.ts）
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ProviderCallbacks } from "@/features/ai/core/providers/types";
import { createItemState, itemCompleted, itemStarted } from "./items";
import type { ThreadItem, ThreadTokenUsage } from "./protocol";

const usage = (tokens: number) => ({ total: { totalTokens: tokens }, last: { totalTokens: tokens }, modelContextWindow: 1000 }) as ThreadTokenUsage;

function recorder() {
  const events: any[] = [];
  const cb = { emit: (e: unknown) => events.push(e), compacting: () => {} } as unknown as ProviderCallbacks;
  return { cb, events };
}

test("思考: 中身がなく 1 秒に満たない思考は残さない", () => {
  const { cb, events } = recorder();
  const state = createItemState();
  itemCompleted({ type: "reasoning", id: "r1", summary: [], content: [], startedAtMs: 1000, completedAtMs: 1001 } as unknown as ThreadItem, cb, state);
  itemCompleted({ type: "reasoning", id: "r2", summary: ["考えた"], content: [], startedAtMs: 1000, completedAtMs: 1001 } as unknown as ThreadItem, cb, state);
  itemCompleted({ type: "reasoning", id: "r3", summary: [], content: [], startedAtMs: 1000, completedAtMs: 3500 } as unknown as ThreadItem, cb, state);
  assert.deepEqual(events, [
    { type: "thinking", text: "考えた", duration_ms: 1 },
    { type: "thinking", text: "", duration_ms: 2500 },
  ]);
});

test("圧縮: 始めたときの大きさが分かれば前後を、分からなければいまの数を残す", () => {
  const { cb, events } = recorder();
  const state = createItemState();
  const compaction = { type: "contextCompaction", id: "c1" } as unknown as ThreadItem;
  state.usage = usage(35_000);
  itemStarted(compaction, cb, state);
  state.usage = usage(17_000);
  itemCompleted(compaction, cb, state);
  // 手で頼んだ圧縮（始めたときにまだ数が届いていない）
  state.usage = null;
  itemStarted(compaction, cb, state);
  state.usage = usage(12_000);
  itemCompleted(compaction, cb, state);
  assert.deepEqual(events, [
    { type: "compact", trigger: "auto", pre_tokens: 35_000, post_tokens: 17_000 },
    { type: "compact", trigger: "auto", pre_tokens: 12_000 },
  ]);
});
