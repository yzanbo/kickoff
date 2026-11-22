import assert from "node:assert/strict";
import { test } from "vitest";
import { collectSubagents } from "@shared/chat/subagents";
import { makeChat, makeEvent } from "@shared/foundation/testing/factories";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Approval } from "@shared/chat/approvalTypes";
import type { ChatSource } from "@/features/chat/ui";
import { createChatSubagents } from "./selectors";

/** 店の口のうち、サブエージェントの計算が読む欄だけを持つ偽物（記録と回答待ちを差し替えられる） */
function fakeSource() {
  const state = { events: [] as ChatEvent[], approvals: [] as Approval[] };
  const chat = makeChat(1, { status: "running" });
  const live = { background: null };
  const progress = { progress: {}, progressAt: {} };
  const source = {
    detail: () => ({ chat, approvals: state.approvals, live }),
    log: () => ({ digest: state.events }),
    progress: () => progress,
  } as unknown as ChatSource;
  return { state, source, setEvents: (events: ChatEvent[]) => (state.events = events) };
}

const agentCall = (id: number, key: string) => makeEvent(id, "tool_use", { id: key, name: "Agent", input: { description: `調査${id}`, subagent_type: "general-purpose" } });

test("サブエージェント: 入力が同じ物なら同じ結果を返し、記録が届いたら作り直す（一覧は collectSubagents と同じ）", () => {
  const { source, setEvents } = fakeSource();
  const subagents = createChatSubagents();
  setEvents([agentCall(1, "a1")]);
  const first = subagents(source, 1);
  assert.equal(subagents(source, 1), first);
  assert.deepEqual(
    first.entries.map((s) => s.key),
    collectSubagents([agentCall(1, "a1")], {}, true).map((s) => s.key),
  );
  assert.equal(first.tree.byKey.get("a1")?.description, "調査1");
  // 記録が 1 件届いた: 新しい配列なので作り直す
  setEvents([agentCall(1, "a1"), agentCall(2, "a2")]);
  const next = subagents(source, 1);
  assert.notEqual(next, first);
  assert.deepEqual([...next.tree.byKey.keys()], ["a1", "a2"]);
});

test("サブエージェント: 回答待ちだけが変わっても、一覧と入れ子は前と同じ物", () => {
  const { state, source, setEvents } = fakeSource();
  const subagents = createChatSubagents();
  setEvents([agentCall(1, "a1")]);
  const first = subagents(source, 1);
  state.approvals = [];
  const next = subagents(source, 1);
  assert.equal(next.entries, first.entries);
  assert.equal(next.tree, first.tree);
  assert.equal(next.hues, first.hues);
});
