import assert from "node:assert/strict";
import { test } from "vitest";
import { makeEvent } from "@shared/foundation/testing/factories";
import { groupEvents } from "./timelineItems";

test("groupEvents: 連続するツールの実行を 1 つにまとめ、結果は呼び出しにぶら下げる。init・thinking などは出さない", () => {
  const items = groupEvents([
    makeEvent(1, "init", { session_id: "s1" }),
    makeEvent(2, "user", { text: "やって" }),
    makeEvent(3, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "a", content: "ok" }),
    makeEvent(5, "tool_use", { id: "b", name: "Bash", input: {} }),
    makeEvent(6, "thinking", { text: "" }),
    makeEvent(7, "text", { text: "できました" }),
    makeEvent(8, "tool_use", { id: "c", name: "Edit", input: {} }),
    // 対応する呼び出しがない結果は捨てる
    makeEvent(9, "tool_result", { tool_use_id: "zzz", content: "" }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["event:e2", "tools:t3", "event:e7", "tools:t8"],
  );
  const tools = items[1];
  assert.ok(tools.kind === "tools");
  assert.deepEqual(
    tools.tools.map((t) => [t.use.id, t.result?.id]),
    [
      [3, 4],
      [5, undefined],
    ],
  );
});
test("groupEvents: 図のツール（show_visual・update_visual）はまとまりに入れず、文の間の図の項目にする", () => {
  const items = groupEvents([
    makeEvent(1, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(2, "tool_use", { id: "v", name: "mcp__kickoff_chat__show_visual", input: { kind: "svg", code: "<svg/>" } }),
    makeEvent(3, "tool_result", { tool_use_id: "v", content: "visual_id: v-abcdefgh" }),
    makeEvent(4, "tool_use", { id: "b", name: "Bash", input: {} }),
    makeEvent(5, "tool_use", { id: "u", name: "mcp__kickoff_chat__update_visual", input: { visual_id: "v-abcdefgh", code: "<svg/>" } }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["tools:t1", "visual:v2", "tools:t4", "visual:v5"],
  );
  const shown = items[1];
  assert.ok(shown.kind === "visual" && shown.call.result?.id === 3);
});
test("groupEvents: parent を渡すとそのサブエージェントの分だけ、渡さなければメインエージェントの分だけ", () => {
  const events = [makeEvent(1, "text", { text: "親" }), makeEvent(2, "text", { text: "子", parent: "sub1" }), makeEvent(3, "tool_use", { id: "x", name: "Read", input: {}, parent: "sub1" })];
  assert.deepEqual(
    groupEvents(events).map((i) => i.key),
    ["e1"],
  );
  assert.deepEqual(
    groupEvents(events, ["sub1"]).map((i) => i.key),
    ["e2", "t3"],
  );
});
test("groupEvents: 思考は、中身があるか 2 秒以上考えたものだけ出す（短い思考ではツールのまとまりを分けない）", () => {
  const items = groupEvents([
    makeEvent(1, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(2, "thinking", { text: "", duration_ms: 800 }),
    makeEvent(3, "tool_use", { id: "b", name: "Read", input: {} }),
    makeEvent(4, "thinking", { text: "", duration_ms: 8_000 }),
    makeEvent(5, "thinking", { text: "考えたこと" }),
    makeEvent(6, "thinking", { text: "" }),
  ]);
  assert.deepEqual(
    items.map((i) => (i.kind === "tools" ? `tools:${i.tools.length}` : i.kind === "event" ? i.event.id : i.key)),
    ["tools:2", 4, 5],
  );
});
test("groupEvents: サブエージェントの起動はツールのまとまりに入れず、カードの項目にする（前後のツールは別のまとまり）", () => {
  const items = groupEvents([
    makeEvent(1, "tool_use", { id: "b1", name: "Bash", input: {} }),
    makeEvent(2, "tool_use", { id: "a1", name: "Agent", input: { description: "調査" } }),
    makeEvent(3, "tool_use", { id: "b2", name: "Bash", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "a1", content: "報告", is_error: false }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["tools:t1", "subagent:s2", "tools:t3"],
  );
  const card = items[1];
  assert.ok(card.kind === "subagent");
  assert.equal(card.call.result?.id, 4);
});
test("groupEvents: サブエージェントの中身は、行のキーと再開した回の呼び出し ID の記録を並べる（入れ子の起動もカード）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "a1", name: "Agent", input: {} }),
    makeEvent(2, "text", { text: "1 回目", parent: "a1" }),
    makeEvent(3, "tool_use", { id: "a2", name: "Agent", input: {}, parent: "a1" }),
    makeEvent(4, "text", { text: "孫の中", parent: "a2" }),
    makeEvent(5, "text", { text: "再開した回", parent: "sm1" }),
  ];
  assert.deepEqual(
    groupEvents(events, ["a1", "sm1"]).map((i) => i.kind + ":" + i.key),
    ["event:e2", "subagent:s3", "event:e5"],
  );
  assert.deepEqual(
    groupEvents(events, ["a2"]).map((i) => i.key),
    ["e4"],
  );
});
test("groupEvents: 裏で動かしたサブエージェントが終わったら、起動した流れのその時刻の位置に 1 行（待つ形のものには出さない）", () => {
  const launched = "Async agent launched successfully.\nagentId: t1 (internal ID)";
  const events = [
    makeEvent(1, "tool_use", { id: "a1", name: "Agent", input: {} }),
    makeEvent(2, "subagent", { task_id: "t1", tool_use_id: "a1", description: "裏の調査", status: "running" }),
    makeEvent(3, "tool_result", { tool_use_id: "a1", content: launched, is_error: false }),
    makeEvent(4, "tool_use", { id: "a2", name: "Agent", input: {} }),
    makeEvent(5, "tool_use", { id: "a3", name: "Agent", input: {}, parent: "a2" }),
    makeEvent(6, "tool_result", { tool_use_id: "a3", content: "Async agent launched successfully.\nagentId: t3", is_error: false, parent: "a2" }),
    makeEvent(7, "subagent", { task_id: "t3", tool_use_id: "a3", description: "孫", status: "completed" }),
    makeEvent(8, "text", { text: "続き" }),
    makeEvent(9, "subagent", { task_id: "t1", tool_use_id: "a1", description: "", status: "completed" }),
    makeEvent(10, "tool_result", { tool_use_id: "a2", content: "待つ形の報告", is_error: false }),
    makeEvent(11, "subagent", { task_id: "t2", tool_use_id: "a2", description: "待つ形", status: "completed" }),
  ];
  const main = groupEvents(events);
  assert.deepEqual(
    main.map((i) => i.kind + ":" + i.key),
    ["subagent:s1", "subagent:s4", "event:e8", "subagentEnd:x9"],
  );
  const end = main[3];
  assert.ok(end.kind === "subagentEnd");
  assert.equal(end.agentKey, "a1");
  // 入れ子: 孫の終わりは、起動した子の流れに出す
  assert.deepEqual(
    groupEvents(events, ["a2"]).map((i) => i.kind + ":" + i.key),
    ["subagent:s5", "subagentEnd:x7"],
  );
});

test("groupEvents: 前の回の項目を渡すと、中身が同じ項目は前の物を返す（結果が届いたまとまり・新しい項目だけ新しい物）", () => {
  const events = [
    makeEvent(1, "user", { text: "やって" }),
    makeEvent(2, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(3, "tool_result", { tool_use_id: "a", content: "ok" }),
    makeEvent(4, "text", { text: "途中" }),
    makeEvent(5, "tool_use", { id: "b", name: "Bash", input: {} }),
  ];
  const first = groupEvents(events);
  const more = [...events, makeEvent(6, "tool_result", { tool_use_id: "b", content: "done" }), makeEvent(7, "text", { text: "終わり" })];
  const next = groupEvents(more, undefined, { prev: first });
  assert.deepEqual(next.map((i) => i.key), ["e1", "t2", "e4", "t5", "e7"]);
  // 変わらない発言・ツールのまとまりは同じ物、結果が届いたまとまりは新しい物
  assert.equal(next[0], first[0]);
  assert.equal(next[1], first[1]);
  assert.equal(next[2], first[2]);
  assert.notEqual(next[3], first[3]);
  // 同じ記録で組み立て直せば、全部が前の物
  assert.ok(groupEvents(more, undefined, { prev: next }).every((item, i) => item === next[i]));
});
