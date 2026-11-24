import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { advanceMarks, emptyMarks, marksFrom, preCompactSent, type MarksReader } from "./marks";

const ev = (id: number, type: ChatEvent["type"], data: Record<string, unknown> = {}) => ({ id, chat_id: 1, type, data, created_at: "2026-11-21T00:00:00.000Z" }) as ChatEvent;

test("圧縮前指示を送ったかは記録から導く: 圧縮前指示のあと、圧縮か消去の記録までは送ったまま", () => {
  let marks = advanceMarks(emptyMarks, ev(1, "user", { text: "はじめ" }));
  assert.equal(preCompactSent(marks), false);
  marks = advanceMarks(marks, ev(2, "user", { text: "ノート", pre_compact: true }));
  assert.equal(preCompactSent(marks), true);
  // 止めた・失敗した作業の終わりでは外れない
  marks = advanceMarks(marks, ev(3, "result", { status: "cancelled" }));
  assert.equal(preCompactSent(marks), true);
  assert.deepEqual(marks.lastResult, { status: "cancelled", network: false, usageLimitResetsAt: null });
  assert.equal(preCompactSent(advanceMarks(marks, ev(4, "compact", { trigger: "auto", pre_tokens: 1 }))), false);
  assert.equal(preCompactSent(advanceMarks(marks, ev(4, "context_cleared"))), false);
  // 使用枠の上限の終わり方も覚える
  marks = advanceMarks(marks, ev(5, "result", { status: "failed", usage_limit: { resets_at: "2026-11-21T10:00:00.000Z" } }));
  assert.deepEqual([marks.lastResultId, marks.lastResult?.usageLimitResetsAt], [5, "2026-11-21T10:00:00.000Z"]);
});

test("状態を作るときは、記録の口のいちばん新しい ID から作る（全記録を読まない）", () => {
  const asked: string[] = [];
  const reader: MarksReader = {
    latestId: (_chatId, q) => (asked.push(`${q.type}${q.preCompact ? "+pre" : ""}`), { user: 9, compact: 4, context_cleared: null, result: 8 }[q.type] ?? null) as number | null,
    latestResult: () => ev(8, "result", { status: "failed", network: true }),
  };
  const marks = marksFrom(reader, 1);
  assert.deepEqual(marks, { lastUserId: 9, lastResultId: 8, lastCompactId: 4, lastPreCompactId: 9, lastClearedId: 0, lastResult: { status: "failed", network: true, usageLimitResetsAt: null } });
  assert.equal(preCompactSent(marks), true);
  assert.deepEqual(asked, ["user", "compact", "user+pre", "context_cleared"]);
});
