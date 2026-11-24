import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { makeEvent } from "@shared/chat/testing";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { indexOfEvents, mergeById, metaOfEvent, selectIndexIds, slimIndexEvent, type IndexContext } from "./chatIndex";
import { collectSubagents } from "./subagents";
import { subagentReport } from "./subagentReport";
import { subagentAskers } from "./subagentState";

/** 記録の中の呼び出しから、回答待ち・裏の作業が指す呼び出しを種で決めて選ぶ（R3 を確かめる） */
function contextOf(events: readonly ChatEvent[]): IndexContext {
  const calls = events.filter((e) => e.type === "tool_use").map((e) => (e.type === "tool_use" ? e.data.id : ""));
  return { approvalCallIds: calls.filter((_, i) => i % 7 === 3), backgroundCallIds: calls.filter((_, i) => i % 11 === 5) };
}

/** 索引 ＋ 末尾（切れ目 s の前は索引、s から後ろは中身のまま） */
const digestAt = (events: readonly ChatEvent[], s: number, ctx: IndexContext) =>
  s >= events.length ? indexOfEvents(events, Number.MAX_SAFE_INTEGER, ctx) : [...indexOfEvents(events, events[s].id, ctx), ...events.slice(s)];

/** 記録全体から作るもの（@shared の関数）を、同じ記録の並びに流した結果 */
function digestResults(events: ChatEvent[], ctx: IndexContext) {
  const approvals = ctx.approvalCallIds.map((id) => ({ id, kind: "permission" as const, tool_use_id: id }));
  const out: unknown[] = [];
  for (const busy of [true, false]) {
    for (const live of [undefined, new Set<string>()]) {
      const entries = collectSubagents(events, {}, busy, live);
      out.push(entries, entries.map((e) => subagentReport(e, events)), [...subagentAskers(approvals, events, entries)]);
    }
  }
  return out;
}

test("どの切れ目の索引 ＋ 末尾でも、記録全体から作るもの（サブエージェント・報告・回答待ち。図は @shared/visuals の aiVisual.test.ts）が全件と同じになる（ランダムな記録。種は固定）", () => {
  for (const [seed, running] of [[1, false], [2, true], [3, false], [7, true]] as const) {
    const events = scenarioChat({ turns: 24, seed, running });
    const ctx = contextOf(events);
    const full = digestResults(events, ctx);
    for (let s = 0; s <= events.length; s++) {
      assert.deepEqual(digestResults(digestAt(events, s, ctx), ctx), full, `種 ${seed}・切れ目 ${s}（記録 ${events[s]?.id ?? "終わり"} から末尾）`);
    }
  }
});

test("索引は記録全体から作るものが読む記録だけを持ち、メインのツールの呼び出しと返答の文は入れない", () => {
  const events = scenarioChat({ turns: 40, seed: 5 });
  const index = indexOfEvents(events, Number.MAX_SAFE_INTEGER, { approvalCallIds: [], backgroundCallIds: [] });
  const mainTools = events.filter((e) => e.type === "tool_use" && !e.data.parent && ["Read", "Bash", "Edit", "Grep"].includes(e.data.name)).length;
  assert.ok(index.length <= events.length - mainTools * 2, `索引 ${index.length} 件 / 全 ${events.length} 件`);
  // R5（報告のあとの親の最初の動き）で入るものも、中身は空にする
  assert.ok(!index.some((e) => e.type === "tool_use" && !e.data.parent && ["Read", "Bash", "Edit", "Grep"].includes(e.data.name) && JSON.stringify(e.data.input) !== "{}"));
  assert.ok(!index.some((e) => e.type === "text" && !e.data.parent && e.data.text !== ""));
});

test("R3: 回答待ち・裏の作業が指す呼び出しは input を空にして入れ、R4 の parent ごとの最後の呼び出しは input を残す", () => {
  const events = [
    makeEvent(1, "user", { text: "頼む" }),
    makeEvent(2, "tool_use", { id: "a", name: "Bash", input: { command: "sleep 100" } }),
    makeEvent(3, "tool_use", { id: "b", name: "Read", input: { file_path: "/x" }, parent: "p" }),
    makeEvent(4, "tool_use", { id: "c", name: "Grep", input: { pattern: "y" }, parent: "p" }),
    makeEvent(5, "text", { text: "中の文", parent: "p" }),
    makeEvent(6, "result", { status: "completed", text: "返答の写し" }),
  ];
  const picked = selectIndexIds(events.map(metaOfEvent), 7, { approvalCallIds: [], backgroundCallIds: ["a"] });
  assert.deepEqual([...picked].sort((x, y) => x[0] - y[0]), [[1, "full"], [2, "slim"], [4, "full"], [5, "slim"], [6, "full"]]);
  assert.deepEqual(slimIndexEvent(events[1], "slim").data, { id: "a", name: "Bash", input: {} });
  // 成功した作業の終わりの返答の写しは外し、失敗の文は残す
  assert.equal("text" in slimIndexEvent(events[5], "full").data, false);
  const failed = makeEvent(7, "result", { status: "failed", text: "API Error: Connection error." });
  assert.equal(slimIndexEvent(failed, "full"), failed);
});

test("mergeById は ID の順に 1 本にし、同じ ID は先の並びのものを使う", () => {
  const a = makeEvent(1, "user", { text: "a" });
  const b = makeEvent(3, "user", { text: "b" });
  const slim = makeEvent(3, "user", { text: "" });
  const c = makeEvent(2, "user", { text: "c" });
  assert.deepEqual(mergeById([a, b], [c, slim]).map((e) => e.id), [1, 2, 3]);
  assert.equal(mergeById([a, b], [slim])[1], b);
});
