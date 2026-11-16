import assert from "node:assert/strict";
import { test } from "vitest";
import { gatherReplies } from "./gatherReplies";

test("gatherReplies: 受け持てた答えが届いたらすぐそれ、どれも受け持てなければ最後の断り。決まったあとの答えは捨てる", () => {
  const got: string[] = [];
  const reply = gatherReplies<string>(3, (r) => r.startsWith("ok"), (r) => got.push(r));
  reply("ng1");
  assert.deepEqual(got, []);
  reply("ok2");
  assert.deepEqual(got, ["ok2"]);
  reply("ng3");
  assert.deepEqual(got, ["ok2"]);

  const none: string[] = [];
  const all = gatherReplies<string>(2, (r) => r.startsWith("ok"), (r) => none.push(r));
  all("ng1");
  all("ng2");
  assert.deepEqual(none, ["ng2"]);
});
