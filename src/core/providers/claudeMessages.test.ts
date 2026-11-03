import assert from "node:assert/strict";
import { test } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RunEventData } from "../types.js";
import { createThinkingTimer, emitSdkMessage } from "./claudeMessages.js";
import type { ProviderCallbacks } from "./types.js";

/** 受け取ったイベントを記録する偽のコールバック */
function recorder() {
  const events: RunEventData[] = [];
  const cb = { emit: (e: RunEventData) => events.push(e), requestApproval: async () => ({ action: "deny" }) } as unknown as ProviderCallbacks;
  return { events, cb };
}

const stream = (event: object, parent: string | null = null) => ({ type: "stream_event", parent_tool_use_id: parent, event }) as unknown as SDKMessage;
const assistant = (content: object[], parent: string | null = null) =>
  ({ type: "assistant", parent_tool_use_id: parent, message: { content, usage: {} } }) as unknown as SDKMessage;

test("思考: 途中経過の始まりと終わりから時間を測り、中身が空でも時間つきで残す", () => {
  const { events, cb } = recorder();
  const timer = createThinkingTimer();
  emitSdkMessage(stream({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }), cb, timer, 1_000);
  emitSdkMessage(stream({ type: "content_block_stop", index: 0 }), cb, timer, 9_500);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "", signature: "s" }]), cb, timer, 9_600);
  assert.deepEqual(events, [{ type: "thinking", text: "", duration_ms: 8_500 }]);
});

test("思考: 終わりの知らせより先に中身が届いたら、始まりから数える。測れず中身も空なら残さない", () => {
  const { events, cb } = recorder();
  const timer = createThinkingTimer();
  emitSdkMessage(stream({ type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "x" } }), cb, timer, 2_000);
  emitSdkMessage(assistant([{ type: "redacted_thinking", data: "x" }]), cb, timer, 5_000);
  emitSdkMessage(stream({ type: "content_block_stop", index: 1 }), cb, timer, 5_100);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "  ", signature: "s" }]), cb, timer, 6_000);
  assert.deepEqual(events, [{ type: "thinking", text: "", duration_ms: 3_000 }]);
});

test("思考: サブエージェントの思考は測らず、中身があればどのサブエージェントのものかを付けて残す", () => {
  const { events, cb } = recorder();
  const timer = createThinkingTimer();
  emitSdkMessage(stream({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }, "tu1"), cb, timer, 1_000);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "考え", signature: "s" }], "tu1"), cb, timer, 2_000);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "", signature: "s" }], "tu1"), cb, timer, 2_000);
  assert.deepEqual(events, [{ type: "thinking", text: "考え", sub: true, parent: "tu1" }]);
});
