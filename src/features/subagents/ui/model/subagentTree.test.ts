import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence, makeSubagent } from "@shared/foundation/testing/factories";
import { childrenOf, flattenTree, latestActivity, pathOf, scopeOf, subagentTree } from "./subagentTree";

test("subagentTree: 子は起動した順、親が一覧にないものはメインが起動したものとして扱う", () => {
  const tree = subagentTree([makeSubagent("a"), makeSubagent("b", { parentKey: "a" }), makeSubagent("c", { parentKey: "a" }), makeSubagent("d", { parentKey: "gone" })]);
  assert.deepEqual(childrenOf(tree, undefined).map((s) => s.key), ["a", "d"]);
  assert.deepEqual(childrenOf(tree, "a").map((s) => s.key), ["b", "c"]);
  assert.deepEqual(childrenOf(tree, "b"), []);
});

test("pathOf: いちばん外側から自分までの道筋。scopeOf: 行のキーと再開した回の呼び出し ID", () => {
  const tree = subagentTree([makeSubagent("a"), makeSubagent("b", { parentKey: "a", aliases: ["sm1"] }), makeSubagent("c", { parentKey: "b" })]);
  assert.deepEqual(pathOf(tree, "c").map((s) => s.key), ["a", "b", "c"]);
  assert.deepEqual(pathOf(tree, "zzz"), []);
  assert.deepEqual(scopeOf(tree.byKey.get("b")!), ["b", "sm1"]);
  assert.deepEqual(scopeOf(tree.byKey.get("a")!), ["a"]);
});

test("flattenTree: いちばん外側は新しいものを上に、子は親のすぐ下に起動した順で深さ付き", () => {
  const tree = subagentTree([makeSubagent("a"), makeSubagent("b", { parentKey: "a" }), makeSubagent("c", { parentKey: "b" }), makeSubagent("d")]);
  assert.deepEqual(
    flattenTree(tree).map((r) => `${r.entry.key}:${r.depth}`),
    ["d:0", "a:0", "b:1", "c:2"],
  );
});

test("latestActivity: 自分と子孫の中のいちばん新しい呼び出し（子孫のものなら、その子孫も返す。ほかのサブエージェントは見ない）", () => {
  const ev = eventSequence();
  const tree = subagentTree([makeSubagent("a", { aliases: ["sm1"] }), makeSubagent("b", { parentKey: "a" }), makeSubagent("x")]);
  const events = [
    ev("tool_use", { id: "r1", name: "Read", input: {}, parent: "a" }),
    ev("tool_use", { id: "g1", name: "Grep", input: {}, parent: "b" }),
    ev("tool_use", { id: "o1", name: "Bash", input: {}, parent: "x" }),
  ];
  const latest = latestActivity(tree, "a", events);
  assert.deepEqual([latest?.use.data.id, latest?.by?.key], ["g1", "b"]);
  // 再開した回（parent が SendMessage の ID）も自分のもの
  const resumed = latestActivity(tree, "a", [...events, ev("tool_use", { id: "s1", name: "Bash", input: {}, parent: "sm1" })]);
  assert.deepEqual([resumed?.use.data.id, resumed?.by], ["s1", undefined]);
  assert.equal(latestActivity(tree, "zzz", events), undefined);
});
