import { test } from "vitest";
import assert from "node:assert/strict";
import { connectionLabel } from "./connectionLabel";

test("接続の札: 一度もつながっていない間の再接続は「接続中」、つながったことがあれば「切断（再接続中）」", () => {
  assert.equal(connectionLabel("connecting", null), "Kickoff サーバーに接続中…");
  assert.equal(connectionLabel("connecting", 1), "Kickoff サーバーから切断（再接続中）");
  assert.equal(connectionLabel("closed", null), "Kickoff サーバーから切断");
  assert.equal(connectionLabel("open", 1), "Kickoff サーバーに接続済み");
});
