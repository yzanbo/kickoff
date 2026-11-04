import assert from "node:assert/strict";
import test from "node:test";
import { isBackgroundLaunch } from "./backgroundTasks";

test("裏で動かしたサブエージェントの起動の知らせを見分ける", () => {
  assert.equal(isBackgroundLaunch("Async agent launched successfully. agentId: x"), true);
  assert.equal(isBackgroundLaunch("報告の本文"), false);
  assert.equal(isBackgroundLaunch(undefined), false);
});
