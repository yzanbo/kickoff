import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubagentEntry } from "@shared/chat/subagents";
import { eventSequence } from "@shared/testing/factories";
import { childrenOf, flattenTree, latestActivity, pathOf, scopeOf, subagentTree } from "./subagentTree";

const entry = (key: string, parentKey?: string, aliases?: string[]): SubagentEntry => ({
  key,
  description: key,
  status: "running",
  ...(parentKey ? { parentKey } : {}),
  ...(aliases ? { aliases } : {}),
});

test("subagentTree: 子は起動した順、親が一覧にないものはメインが起動したものとして扱う", () => {
  const tree = subagentTree([entry("a"), entry("b", "a"), entry("c", "a"), entry("d", "gone")]);
  assert.deepEqual(childrenOf(tree, undefined).map((s) => s.key), ["a", "d"]);
  assert.deepEqual(childrenOf(tree, "a").map((s) => s.key), ["b", "c"]);
  assert.deepEqual(childrenOf(tree, "b"), []);
});

test("pathOf: いちばん外側から自分までの道筋。scopeOf: 行のキーと再開した回の呼び出し ID", () => {
  const tree = subagentTree([entry("a"), entry("b", "a", ["sm1"]), entry("c", "b")]);
  assert.deepEqual(pathOf(tree, "c").map((s) => s.key), ["a", "b", "c"]);
  assert.deepEqual(pathOf(tree, "zzz"), []);
  assert.deepEqual(scopeOf(tree.byKey.get("b")!), ["b", "sm1"]);
  assert.deepEqual(scopeOf(tree.byKey.get("a")!), ["a"]);
});

test("flattenTree: いちばん外側は新しいものを上に、子は親のすぐ下に起動した順で深さ付き", () => {
  const tree = subagentTree([entry("a"), entry("b", "a"), entry("c", "b"), entry("d")]);
  assert.deepEqual(
    flattenTree(tree).map((r) => `${r.entry.key}:${r.depth}`),
    ["d:0", "a:0", "b:1", "c:2"],
  );
});

test("latestActivity: 自分と子孫の中のいちばん新しい呼び出し（子孫のものなら、その子孫も返す。ほかのサブエージェントは見ない）", () => {
  const ev = eventSequence();
  const tree = subagentTree([entry("a", undefined, ["sm1"]), entry("b", "a"), entry("x")]);
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
