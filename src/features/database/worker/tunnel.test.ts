// SSH トンネルの失敗の文（初めてのサーバーは印を頭に付ける・鍵が変わった・ログインできない・ほかは最後の行）
import assert from "node:assert/strict";
import { test } from "vitest";
import { DB_SSH_UNKNOWN_HOST } from "@shared/database/types";
import { tunnelError } from "./tunnel";

test("tunnelError: 初めてのサーバー・鍵が変わった・ログインできない・ほかは最後の 3 行", () => {
  const unknown = "No ED25519 host key is known for bastion and you have requested strict checking.\nHost key verification failed.";
  const changed = "@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.";
  assert.ok(tunnelError("bastion", unknown).startsWith(`${DB_SSH_UNKNOWN_HOST}: `));
  assert.match(tunnelError("bastion", changed), /前に受け入れたものと違います/);
  assert.match(tunnelError("bastion", "ec2-user@bastion: Permission denied (publickey)."), /ログインできません.*Permission denied/);
  assert.match(tunnelError("bastion", "a\nb\nssh: connect to host bastion port 22: Connection refused\nc\n"), /^SSH トンネルを開けませんでした（bastion）: b \/ ssh: connect.* \/ c$/);
  assert.match(tunnelError("bastion", ""), /ssh が終わりました/);
});
