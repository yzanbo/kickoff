import assert from "node:assert/strict";
import { test } from "vitest";
import { subagentOpenModel } from "./subagentOpen";

test("subagentOpenModel: 見出しは設定の場所に置ければそこ、置けなければ流れの中（別ウィンドウを開けないときに右の欄へは回さない）", () => {
  const head = (openIn: "inline" | "side" | "window", canSide: boolean, canWindow: boolean) => subagentOpenModel({ openIn, canSide, canWindow, depth: 0 }).head;
  assert.equal(head("window", true, true), "window");
  assert.equal(head("window", true, false), "inline");
  assert.equal(head("side", true, true), "side");
  assert.equal(head("side", false, true), "inline");
  assert.equal(head("inline", true, true), "inline");
});

test("subagentOpenModel: 「右の欄で開く」は右の欄を置けて見出しが右の欄でないときだけ・深さ 3 以上は字下げしない", () => {
  assert.equal(subagentOpenModel({ openIn: "side", canSide: true, canWindow: true, depth: 0 }).sideLink, false);
  assert.equal(subagentOpenModel({ openIn: "inline", canSide: true, canWindow: true, depth: 0 }).sideLink, true);
  assert.equal(subagentOpenModel({ openIn: "window", canSide: false, canWindow: true, depth: 0 }).sideLink, false);
  assert.deepEqual([2, 3, 5].map((depth) => subagentOpenModel({ openIn: "inline", canSide: true, canWindow: true, depth }).flat), [false, true, true]);
});
