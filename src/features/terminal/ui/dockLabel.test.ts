import { test } from "vitest";
import assert from "node:assert/strict";
import { terminalDockLabel } from "./dockLabel";

test("別ウィンドウのターミナルの「戻す」は、戻す先の欄の名前を出す（知らない住所は「元の欄」）", () => {
  assert.equal(terminalDockLabel("side:1").label, "右サイドバーに戻す");
  assert.equal(terminalDockLabel("bottom:all").label, "下のパネルに戻す");
  assert.equal(terminalDockLabel("agents:3").label, "右の欄に戻す");
  assert.equal(terminalDockLabel("board:1").label, "元の欄に戻す");
  assert.equal(terminalDockLabel("壊れた住所").label, "元の欄に戻す");
});
