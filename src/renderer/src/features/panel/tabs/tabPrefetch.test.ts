import assert from "node:assert/strict";
import { test } from "vitest";
import { neighborChats } from "./tabPrefetch";

const chatOf = (key: string) => (key.startsWith("c") ? Number(key.slice(1)) : null);

test("表のタブに近い順に、チャットのタブだけを上限まで", () => {
  const panes = [{ tabs: ["c1", "c2", "f1", "c3", "c4", "c5", "c6", "c7", "c8"], shown: "c4" }];
  assert.deepEqual(neighborChats(panes, chatOf), [3, 5, 6, 2, 7]);
  assert.deepEqual(neighborChats(panes, chatOf, 2), [3, 5]);
});

test("ペインをまたいで近いものから。描いたタブ（null）と重なりは除く", () => {
  const panes = [
    { tabs: ["c1", "c2", "c3"], shown: "c1" },
    { tabs: ["c9", "c2"], shown: "c9" },
  ];
  assert.deepEqual(neighborChats(panes, (k) => (k === "c3" ? null : chatOf(k))), [2]);
  assert.deepEqual(neighborChats([{ tabs: ["c1", "c2"], shown: null }], chatOf), [1, 2]);
});
