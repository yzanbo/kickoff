import { test } from "vitest";
import assert from "node:assert/strict";
import { denyReasonText, hasDenyReason } from "./denyReason";
import { makeAttachment } from "./testing";

test("拒否の記録に理由か添付があるときだけ、拒否の理由として出す", () => {
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "deny" }), false);
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "deny", message: "" }), false);
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "deny", attachments: [] }), false);
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "allow" }), false);
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "deny", message: "別の方法で" }), true);
  assert.equal(hasDenyReason({ approval_id: "a", kind: "permission", action: "deny", attachments: [makeAttachment("x")] }), true);
});

test("拒否の理由の文は、書いたままの理由に添付の名前を添える", () => {
  const file = makeAttachment("x", { name: "image.png" });
  assert.equal(denyReasonText({ approval_id: "a", kind: "permission", action: "deny", message: "これを見て\n直して", attachments: [file] }), "これを見て\n直して（添付: image.png）");
  assert.equal(denyReasonText({ approval_id: "a", kind: "permission", action: "deny", attachments: [file] }), "（添付: image.png）");
});
