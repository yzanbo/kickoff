import { test } from "vitest";
import assert from "node:assert/strict";
import { makeAttachment } from "@shared/chat/testing";
import { denyFormModel } from "./denyFormModel";

test("理由も添付もなければ「理由なしで拒否」で、理由は空のまま送る", () => {
  const m = denyFormModel({ message: "  \n ", attachments: [], uploading: false });
  assert.deepEqual(m.reason, {});
  assert.equal(m.label, "理由なしで拒否");
  assert.equal(m.canDeny, true);
});

test("理由は前後の空白を除いて送り、改行はそのまま残す", () => {
  const m = denyFormModel({ message: "\n別の方法で\n進めて \n", attachments: [], uploading: false });
  assert.deepEqual(m.reason, { message: "別の方法で\n進めて" });
  assert.equal(m.label, "理由を添えて拒否");
});

test("添付だけでも理由を添えた拒否になり、アップロードの途中は押せない", () => {
  const file = makeAttachment("a1", { name: "image.png" });
  assert.deepEqual(denyFormModel({ message: "", attachments: [file], uploading: false }).reason, { attachments: [file] });
  const uploading = denyFormModel({ message: "見て", attachments: [file], uploading: true });
  assert.equal(uploading.canDeny, false);
  assert.match(uploading.title, /アップロード/);
});
