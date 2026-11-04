import assert from "node:assert/strict";
import { test } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RunEventData } from "../types.js";
import { createMessageState, emitSdkMessage } from "./claudeMessages.js";
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
  const timer = createMessageState();
  emitSdkMessage(stream({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }), cb, timer, 1_000);
  emitSdkMessage(stream({ type: "content_block_stop", index: 0 }), cb, timer, 9_500);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "", signature: "s" }]), cb, timer, 9_600);
  assert.deepEqual(events, [{ type: "thinking", text: "", duration_ms: 8_500 }]);
});

test("思考: 終わりの知らせより先に中身が届いたら、始まりから数える。測れず中身も空なら残さない", () => {
  const { events, cb } = recorder();
  const timer = createMessageState();
  emitSdkMessage(stream({ type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "x" } }), cb, timer, 2_000);
  emitSdkMessage(assistant([{ type: "redacted_thinking", data: "x" }]), cb, timer, 5_000);
  emitSdkMessage(stream({ type: "content_block_stop", index: 1 }), cb, timer, 5_100);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "  ", signature: "s" }]), cb, timer, 6_000);
  assert.deepEqual(events, [{ type: "thinking", text: "", duration_ms: 3_000 }]);
});

test("思考: サブエージェントの思考は測らず、中身があればどのサブエージェントのものかを付けて残す", () => {
  const { events, cb } = recorder();
  const timer = createMessageState();
  emitSdkMessage(stream({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }, "tu1"), cb, timer, 1_000);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "考え", signature: "s" }], "tu1"), cb, timer, 2_000);
  emitSdkMessage(assistant([{ type: "thinking", thinking: "", signature: "s" }], "tu1"), cb, timer, 2_000);
  assert.deepEqual(events, [{ type: "thinking", text: "考え", sub: true, parent: "tu1" }]);
});

test("タスク: サブエージェント（local_agent・種類のない古い CLI）だけを記録し、裏のコマンドなどの開始・途中経過・終了は除く", () => {
  const { events, cb } = recorder();
  const progress: unknown[] = [];
  cb.subagentProgress = (p) => progress.push(p);
  const state = createMessageState();
  const system = (m: object) => ({ type: "system", ...m }) as unknown as SDKMessage;
  emitSdkMessage(system({ subtype: "task_started", task_id: "b1", tool_use_id: "bash1", description: "npm run dev", task_type: "local_bash" }), cb, state);
  emitSdkMessage(system({ subtype: "task_progress", task_id: "b1", description: "", usage: { total_tokens: 0, tool_uses: 0, duration_ms: 1 } }), cb, state);
  emitSdkMessage(system({ subtype: "task_notification", task_id: "b1", status: "failed", summary: "exit 1" }), cb, state);
  emitSdkMessage(system({ subtype: "task_started", task_id: "a1", tool_use_id: "agent1", description: "調査", task_type: "local_agent" }), cb, state);
  emitSdkMessage(system({ subtype: "task_started", task_id: "a2", tool_use_id: "agent2", description: "古い CLI" }), cb, state);
  emitSdkMessage(system({ subtype: "task_notification", task_id: "a1", tool_use_id: "agent1", status: "completed", summary: "済み" }), cb, state);
  assert.deepEqual(
    events.map((e) => (e.type === "subagent" ? [e.task_id, e.status] : e.type)),
    [["a1", "running"], ["a2", "running"], ["a1", "completed"]],
  );
  assert.deepEqual(progress, []);
});

test("圧縮: status の知らせで圧縮の始まりと終わりを 1 回ずつ知らせ、失敗したら理由を残す", () => {
  const { events, cb } = recorder();
  const changes: boolean[] = [];
  cb.compacting = (active) => changes.push(active);
  const state = createMessageState();
  const status = (s: string | null, extra: object = {}) => ({ type: "system", subtype: "status", status: s, ...extra }) as unknown as SDKMessage;
  emitSdkMessage(status("requesting"), cb, state);
  emitSdkMessage(status("compacting"), cb, state);
  emitSdkMessage(status("compacting"), cb, state);
  emitSdkMessage(status(null, { compact_result: "failed", compact_error: "too long" }), cb, state);
  // 圧縮の区切りが先に届いたときも終わりとして扱い、そのあとの status では重ねて知らせない
  emitSdkMessage(status("compacting"), cb, state);
  emitSdkMessage({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 150_000, post_tokens: 20_000 } } as unknown as SDKMessage, cb, state);
  emitSdkMessage(status(null, { compact_result: "success" }), cb, state);
  assert.deepEqual(changes, [true, false, true, false]);
  assert.deepEqual(events, [
    { type: "notice", message: "会話の圧縮に失敗しました（too long）" },
    { type: "compact", trigger: "auto", pre_tokens: 150_000, post_tokens: 20_000 },
  ]);
});
