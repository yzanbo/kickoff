import assert from "node:assert/strict";
import { test } from "vitest";
import { neighborTabs } from "./tabPrefetch";

const wants = (key: string) => key.startsWith("c");

test("表のタブに近い順に、先読みするタブだけを上限まで", () => {
  const panes = [{ tabs: ["c1", "c2", "f1", "c3", "c4", "c5", "c6", "c7", "c8"], shown: "c4" }];
  assert.deepEqual(neighborTabs(panes, wants), ["c3", "c5", "c6", "c2", "c7"]);
  assert.deepEqual(neighborTabs(panes, wants, 2), ["c3", "c5"]);
});

test("ペインをまたいで近いものから。描いたタブ（false）と重なりは除く", () => {
  const panes = [
    { tabs: ["c1", "c2", "c3"], shown: "c1" },
    { tabs: ["c9", "c2"], shown: "c9" },
  ];
  assert.deepEqual(neighborTabs(panes, (k) => k !== "c3" && wants(k)), ["c2"]);
  assert.deepEqual(neighborTabs([{ tabs: ["c1", "c2"], shown: null }], wants), ["c1", "c2"]);
});
