import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent, ChatEvent } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { streamingAppendOf, streamingEffectOf } from "./streamingRules";

/** チャット 7 の記録の知らせ（中身の形は決まりに関わる所だけ） */
const eventOf = (type: string, data: Record<string, unknown> = {}): BusEvent => ({
  type: "chat_event",
  project_id: 1,
  event: { id: 1, chat_id: 7, type, data, created_at: "2026-11-15T00:00:00.000Z" } as unknown as ChatEvent,
});

test("streamingEffectOf: chat_delta は足す", () => {
  assert.deepEqual(streamingEffectOf({ type: "chat_delta", project_id: 1, chat_id: 7, text: "こん" }), { chatId: 7, effect: "append", text: "こん" });
});

test("streamingEffectOf: メインエージェントの文・思考・ツールの呼び出しと結果、作業の終わり・失敗で消す", () => {
  for (const type of ["text", "thinking", "tool_use", "tool_result", "result", "error"]) {
    assert.deepEqual(streamingEffectOf(eventOf(type)), { chatId: 7, effect: "clear" }, type);
  }
});

test("streamingEffectOf: サブエージェントの記録（parent あり）では消さない", () => {
  for (const type of ["text", "thinking", "tool_use", "tool_result"]) {
    assert.equal(streamingEffectOf(eventOf(type, { parent: "toolu_1" })), null, type);
  }
});

test("streamingEffectOf: 裏のサブエージェントの終わり・お知らせ・承認・圧縮・init・渡した記録・コンテキストの消去・自分の発言では消さない", () => {
  for (const type of ["subagent", "notice", "approval", "approval_resolved", "compact", "init", "handoff", "context_cleared", "user"]) {
    assert.equal(streamingEffectOf(eventOf(type)), null, type);
  }
});

test("streamingEffectOf: 巻き戻しと、作業中でなくなったときに消す（作業中のままなら何もしない）", () => {
  assert.deepEqual(streamingEffectOf({ type: "chat_events_deleted", project_id: 1, chat_id: 7, from_event_id: 3 }), { chatId: 7, effect: "clear" });
  assert.deepEqual(streamingEffectOf({ type: "chat", chat: makeChat(7, { status: "completed" }) }), { chatId: 7, effect: "clear" });
  assert.equal(streamingEffectOf({ type: "chat", chat: makeChat(7, { status: "running" }) }), null);
});

test("streamingEffectOf: chat_delta の位置 offset を添える", () => {
  assert.deepEqual(streamingEffectOf({ type: "chat_delta", project_id: 1, chat_id: 7, text: "ちは", offset: 2 }), { chatId: 7, effect: "append", text: "ちは", offset: 2 });
});

test("streamingAppendOf: もう持っている所は捨て、続きだけを足す", () => {
  // 持っている「こんにちは」（5 文字）に、位置ごとの途中の文を当てる
  assert.equal(streamingAppendOf(5, "にちは", 2), "");
  assert.equal(streamingAppendOf(5, "ちは。元気", 3), "。元気");
  assert.equal(streamingAppendOf(5, "。元気", 5), "。元気");
  // 位置がない（古い本体）・間が抜けた（持っている分より先から）ときはそのまま足す
  assert.equal(streamingAppendOf(5, "あ", undefined), "あ");
  assert.equal(streamingAppendOf(5, "あ", 9), "あ");
});
