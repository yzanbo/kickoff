// SSH トンネルの失敗の文（初めてのサーバーは印を付ける・鍵が変わった・ログインできない・ほかは最後の行）
import assert from "node:assert/strict";
import { test } from "vitest";
import { DB_SSH_UNKNOWN_HOST } from "@shared/database/types";
import { tunnelError } from "./tunnel";

test("tunnelError: 初めてのサーバー・鍵が変わった・ログインできない・ほかは最後の 3 行", () => {
  const unknown = "No ED25519 host key is known for bastion and you have requested strict checking.\nHost key verification failed.";
  const changed = "@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.";
  assert.equal(tunnelError("bastion", unknown).code, DB_SSH_UNKNOWN_HOST);
  assert.match(tunnelError("bastion", unknown).message, /^踏み台（bastion）は初めて/);
  assert.equal(tunnelError("bastion", changed).code, undefined);
  assert.match(tunnelError("bastion", changed).message, /前に受け入れたものと違います/);
  assert.match(tunnelError("bastion", "ec2-user@bastion: Permission denied (publickey).").message, /ログインできません.*Permission denied/);
  assert.match(tunnelError("bastion", "a\nb\nssh: connect to host bastion port 22: Connection refused\nc\n").message, /^SSH トンネルを開けませんでした（bastion）: b \/ ssh: connect.* \/ c$/);
  assert.match(tunnelError("bastion", "").message, /ssh が終わりました/);
});
