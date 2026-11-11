// gh の応答の読み方
import assert from "node:assert/strict";
import { test } from "node:test";
import { toPullRequestInfo } from "./github.js";

test("PR の JSON: gh の camelCase（isDraft）を API の is_draft にする（ないときは下書きでない）", () => {
  const base = { number: 3, url: "https://github.com/o/r/pull/3", title: "直す", state: "OPEN" as const };
  assert.deepEqual(toPullRequestInfo({ ...base, isDraft: true }), { ...base, is_draft: true });
  assert.equal(toPullRequestInfo(base).is_draft, false);
});
