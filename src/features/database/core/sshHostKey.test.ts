// 踏み台のサーバーの鍵の指紋
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "vitest";
import { sshFingerprint } from "./sshHostKey";

test("sshFingerprint: ssh-keygen -l と同じ SHA256:（末尾の = なし）", () => {
  const blob = Buffer.from("not really a key, but bytes");
  const expected = crypto.createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
  assert.equal(sshFingerprint(blob.toString("base64")), `SHA256:${expected}`);
  assert.doesNotMatch(sshFingerprint(blob.toString("base64")), /=$/);
});
