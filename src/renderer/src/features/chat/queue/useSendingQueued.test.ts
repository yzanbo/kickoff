import { test } from "node:test";
import assert from "node:assert/strict";
import { sentShownKey } from "./useSendingQueued";

test("sentShownKey: 自分の発言が増えても、預かった指示が増えても変わる（送った指示がどこかに出た）", () => {
  const before = sentShownKey(10, []);
  assert.equal(sentShownKey(10, []), before);
  assert.notEqual(sentShownKey(11, []), before);
  assert.notEqual(sentShownKey(10, [{ id: "a" }]), before);
  assert.notEqual(sentShownKey(10, [{ id: "a" }]), sentShownKey(10, [{ id: "b" }]));
});
