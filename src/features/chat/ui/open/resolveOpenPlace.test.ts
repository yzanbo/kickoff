import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveOpenPlace } from "./openChat";

test("開く場所は、設定の場所を置けるときだけそこにし、置けなければ右の欄、それもだめなら流れの中（設定 × 置ける場所の 9 通り）", () => {
  const caps = [
    { canSide: true, canWindow: true },
    { canSide: true, canWindow: false },
    { canSide: false, canWindow: true },
  ];
  const got = (["inline", "side", "window"] as const).map((setting) => caps.map((c) => resolveOpenPlace(setting, c)));
  assert.deepEqual(got, [
    ["inline", "inline", "inline"],
    ["side", "side", "inline"],
    ["window", "side", "window"],
  ]);
});
