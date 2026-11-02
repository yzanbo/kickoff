import assert from "node:assert/strict";
import { test } from "node:test";
import { activePaneOf, movePane, removePane, splitGroup, type TerminalGroup, type TerminalPaneInfo } from "./terminalGroups";

const pane = (key: string): TerminalPaneInfo => ({ key, cwd: `/repo/${key}`, label: key, projectId: 1 });
const group = (keys: string[], activePane = keys[0], sizes?: number[]): TerminalGroup => ({
  key: "g",
  projectId: 1,
  label: "repo",
  panes: keys.map(pane),
  sizes: sizes ?? keys.map(() => 1 / keys.length),
  activePane,
});

test("splitGroup: 入力先の右に足し、幅をそろえ直し、新しいペインが入力先になる", () => {
  const next = splitGroup(group(["a", "b", "c"], "a", [0.5, 0.25, 0.25]), pane("n"));
  assert.deepEqual(
    next.panes.map((p) => p.key),
    ["a", "n", "b", "c"],
  );
  assert.deepEqual(next.sizes, [0.25, 0.25, 0.25, 0.25]);
  assert.equal(next.activePane, "n");
  // 入力先が最後なら末尾に足す
  assert.deepEqual(
    splitGroup(group(["a", "b"], "b"), pane("n")).panes.map((p) => p.key),
    ["a", "b", "n"],
  );
});

test("removePane: 閉じた幅は残りに割合のまま配り、入力先だったら同じ位置（最後なら 1 つ前）のペインへ", () => {
  const next = removePane(group(["a", "b", "c"], "b", [0.5, 0.25, 0.25]), "b");
  assert.deepEqual(
    next.panes.map((p) => p.key),
    ["a", "c"],
  );
  assert.deepEqual(next.sizes, [2 / 3, 1 / 3]);
  assert.equal(next.activePane, "c");
  assert.equal(removePane(group(["a", "b", "c"], "c"), "c").activePane, "b");
  // 入力先でないペインを閉じても、入力先は変わらない
  assert.equal(removePane(group(["a", "b", "c"], "a"), "c").activePane, "a");
});

test("movePane: 左右に移り、端では反対側へ回る", () => {
  const g = group(["a", "b", "c"], "a");
  assert.equal(movePane(g, 1).activePane, "b");
  assert.equal(movePane(g, -1).activePane, "c");
  assert.equal(movePane(group(["a", "b", "c"], "c"), 1).activePane, "a");
  assert.equal(activePaneOf(group(["a", "b"], "zzz")).key, "a");
});
