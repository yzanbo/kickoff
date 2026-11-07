import assert from "node:assert/strict";
import { test } from "node:test";
import { isClearCommand } from "./queueActions";

test("isClearCommand: 前後の空白を除いた /clear だけ（添付があれば・続きの文があれば・ほかのコマンドは違う）", () => {
  assert.equal(isClearCommand("/clear"), true);
  assert.equal(isClearCommand("  /clear \n"), true);
  assert.equal(isClearCommand("/clear", [{}]), false);
  assert.equal(isClearCommand("/clear して"), false);
  assert.equal(isClearCommand("/clearx"), false);
  assert.equal(isClearCommand("/compact"), false);
  assert.equal(isClearCommand("clear"), false);
});
