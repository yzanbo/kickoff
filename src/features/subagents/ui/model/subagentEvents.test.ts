import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { collectSubagents } from "@shared/chat/subagents";
import { relayMessage, relayedText } from "@shared/chat/prompts";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { eventSequence, makeEvent } from "@shared/foundation/testing/factories";
import { groupEvents } from "@/features/conversation/ui/timeline/timelineItems";
import { subagentEvents } from "./subagentEvents";
import { scopeOf } from "./subagentTree";

/** 前の作り（読み込んだ記録の全体に、伝えた指示を混ぜてから groupEvents に渡す） */
function itemsFromAll(events: ChatEvent[], scope: readonly string[], key: string, agentId: string | undefined) {
  const mixed = agentId
    ? events.map((e) => {
        if (e.type !== "user") return e;
        const text = relayedText(e.data.text, agentId);
        return text === undefined ? e : ({ ...e, data: { ...e.data, text, parent: key } } as ChatEvent);
      })
    : events;
  return groupEvents(mixed, scope);
}

test("選んだ記録から作った手順は、読み込んだ記録の全体から作ったものと同じ", () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    const events = scenarioChat({ turns: 40, seed });
    const entries = collectSubagents(events, {}, false);
    assert.ok(entries.length > 0, `種 ${seed} にサブエージェントがない`);
    for (const entry of entries) {
      const scope = scopeOf(entry);
      const picked = subagentEvents(events, events, scope, entry.key, entry.agentId);
      assert.deepEqual(groupEvents(picked, scope), itemsFromAll(events, scope, entry.key, entry.agentId), `種 ${seed}・${entry.key}`);
    }
  }
});

test("伝えた指示は、伝えた先のサブエージェントの流れにだけ自分の発言として入る", () => {
  const add = eventSequence();
  const events: ChatEvent[] = [
    add("user", { text: "調べて" }),
    add("tool_use", { id: "c1", name: "Agent", input: { description: "調査", prompt: "依頼" } }),
    add("tool_result", { tool_use_id: "c1", content: "Async agent launched agentId: abc1" }),
    add("text", { text: "中の文", parent: "c1" }),
    add("user", { text: relayMessage("abc1", "調査", "これも見て") }),
    add("user", { text: relayMessage("zzz9", "別", "ほかへ") }),
    add("text", { text: "中の文 2", parent: "c1" }),
  ];
  const picked = subagentEvents(events, events, ["c1"], "c1", "abc1");
  assert.deepEqual(
    picked.map((e) => (e.type === "user" ? `user:${e.data.text}:${"parent" in e.data ? String(e.data.parent) : ""}` : `${e.type}:${e.id}`)),
    ["tool_result:3", "text:4", "user:これも見て:c1", "text:7"],
  );
  // 同じ記録からは同じ物（カードの memo が効くように）
  const again = subagentEvents([...events], [...events], ["c1"], "c1", "abc1");
  assert.equal(again[2], picked[2]);
  assert.deepEqual(groupEvents(picked, ["c1"]), itemsFromAll(events, ["c1"], "c1", "abc1"));
});

test("ほかの流れの記録が足されただけなら、前と同じ配列を返す", () => {
  const events = scenarioChat({ turns: 20, seed: 3 });
  const entry = collectSubagents(events, {}, false)[0];
  const scope = scopeOf(entry);
  const before = subagentEvents(events, events, scope, entry.key, entry.agentId);
  const next = [...events, makeEvent(events.length + 1, "text", { text: "メインの返答" })];
  assert.equal(subagentEvents(next, next, scope, entry.key, entry.agentId), before);
  const inside = [...next, makeEvent(events.length + 2, "text", { text: "中の文", parent: entry.key })];
  const after = subagentEvents(inside, inside, scope, entry.key, entry.agentId);
  assert.notEqual(after, before);
  assert.equal(after.at(-1)?.id, events.length + 2);
});

test("末尾より前に伝えた指示も、digest から拾って混ぜる（読み込んだ記録には末尾より前の自分の発言がない）", () => {
  const add = eventSequence();
  const all: ChatEvent[] = [
    add("tool_use", { id: "c1", name: "Agent", input: { description: "調査", prompt: "依頼" } }),
    add("tool_result", { tool_use_id: "c1", content: "Async agent launched agentId: abc1" }),
    add("user", { text: relayMessage("abc1", "調査", "前に伝えた") }),
    add("text", { text: "中の文", parent: "c1" }),
    add("result", { status: "completed", text: "" }),
    add("user", { text: relayMessage("abc1", "調査", "末尾で伝えた") }),
    add("text", { text: "中の文 2", parent: "c1" }),
  ];
  // 末尾は 6 から。サブエージェントの中は loadScope で読んだ（自分の発言は入らない）
  const loaded = [all[0], all[1], all[3], all[5], all[6]];
  const picked = subagentEvents(loaded, all, ["c1"], "c1", "abc1");
  assert.deepEqual(
    picked.filter((e) => e.type === "user").map((e) => (e.type === "user" ? e.data.text : "")),
    ["前に伝えた", "末尾で伝えた"],
  );
  assert.deepEqual(groupEvents(picked, ["c1"]), itemsFromAll(all, ["c1"], "c1", "abc1"));
});
