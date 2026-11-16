import assert from "node:assert/strict";
import { test } from "vitest";
import type { BackgroundState, ChatEvent } from "@shared/types";
import { collectSubagents } from "@shared/chat/subagents";
import { makeChat, makeEvent } from "@shared/testing/factories";
import { EMPTY_DETAIL } from "./chatDetail";
import { createChatSelectors, type SelectorSource } from "./chatSelectors";
import { EMPTY_LOG, EMPTY_PROGRESS, type ChatDetailView, type ChatLogView, type ChatProgressView } from "./chatStoreTypes";

/** 店の口の値を手で差し替えられる偽の店 */
function fakeSource() {
  const state: { detail: ChatDetailView; log: ChatLogView; progress: ChatProgressView } = {
    detail: { chat: makeChat(1, { status: "running" }), approvals: [], live: EMPTY_DETAIL.live, error: null },
    log: EMPTY_LOG,
    progress: EMPTY_PROGRESS,
  };
  const source: SelectorSource = { detail: () => state.detail, log: () => state.log, progress: () => state.progress };
  const setEvents = (events: ChatEvent[]) => (state.log = { ...EMPTY_LOG, digest: events, tail: events, events });
  return { state, source, setEvents };
}

const agentCall = (id: number, key: string) => makeEvent(id, "tool_use", { id: key, name: "Agent", input: { description: `調査${id}`, subagent_type: "general-purpose" } });

test("取り出し口: 入力が同じ物なら同じ結果を返し、記録が届いたら作り直す（一覧は collectSubagents と同じ）", () => {
  const { source, setEvents } = fakeSource();
  const selectors = createChatSelectors(source);
  setEvents([agentCall(1, "a1")]);
  const first = selectors.subagents(1);
  assert.equal(selectors.subagents(1), first);
  assert.equal(selectors.visuals(1), selectors.visuals(1));
  assert.deepEqual(
    first.entries.map((s) => s.key),
    collectSubagents([agentCall(1, "a1")], {}, true).map((s) => s.key),
  );
  assert.equal(first.tree.byKey.get("a1")?.description, "調査1");

  // 記録が 1 件届いた: 新しい配列なので作り直す
  setEvents([agentCall(1, "a1"), agentCall(2, "a2")]);
  const next = selectors.subagents(1);
  assert.notEqual(next, first);
  assert.deepEqual([...next.tree.byKey.keys()], ["a1", "a2"]);
});

test("取り出し口: 回答待ちだけが変わっても、一覧と入れ子は前と同じ物", () => {
  const { state, source, setEvents } = fakeSource();
  const selectors = createChatSelectors(source);
  setEvents([agentCall(1, "a1")]);
  const first = selectors.subagents(1);
  state.detail = { ...state.detail, approvals: [] };
  const next = selectors.subagents(1);
  assert.equal(next.entries, first.entries);
  assert.equal(next.tree, first.tree);
  assert.equal(next.hues, first.hues);
});

test("取り出し口: 裏で動いている呼び出しは、中身が同じなら同じ Set（作業中の様子が替わっても）", () => {
  const { state, source } = fakeSource();
  const selectors = createChatSelectors(source);
  const background = (ids: string[]): BackgroundState => ({ tasks: ids.map((id) => ({ task_id: `t-${id}`, tool_use_id: id, kind: "bash", description: id })) }) as unknown as BackgroundState;
  assert.equal(selectors.backgroundCalls(1).size, 0);
  state.detail = { ...state.detail, live: { ...state.detail.live, background: background(["x"]) } };
  const first = selectors.backgroundCalls(1);
  assert.deepEqual([...first], ["x"]);
  state.detail = { ...state.detail, live: { ...state.detail.live, background: background(["x"]) } };
  assert.equal(selectors.backgroundCalls(1), first);
  state.detail = { ...state.detail, live: { ...state.detail.live, background: background(["x", "y"]) } };
  assert.deepEqual([...selectors.backgroundCalls(1)], ["x", "y"]);
});

test("取り出し口: チャットごとに別に覚える", () => {
  const a = fakeSource();
  const selectors = createChatSelectors({
    detail: (id) => (id === 1 ? a.state.detail : { ...a.state.detail, chat: makeChat(2) }),
    log: (id) => (id === 1 ? a.state.log : EMPTY_LOG),
    progress: () => EMPTY_PROGRESS,
  });
  a.setEvents([agentCall(1, "a1")]);
  assert.equal(selectors.subagents(1).entries.length, 1);
  assert.equal(selectors.subagents(2).entries.length, 0);
  assert.equal(selectors.subagents(1).entries.length, 1);
});
