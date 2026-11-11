// SSH トンネルの引数と ssh の出力の読み方: つなぐ先の引数・ssh -G・known_hosts の名前・指紋・keyscan・~/.ssh/config の Host・失敗の見分け
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DB_SSH_UNKNOWN_HOST } from "@shared/types";
import { isChangedHostKey, isUnknownHostKey, knownHostsName, parseKeyscan, parseSshConfigDump, parseSshConfigHosts, sshFingerprint, sshTargetArgs } from "./sshArgs.js";
import { tunnelError } from "./worker/tunnel.js";

test("sshTargetArgs: 省いたものは渡さず、鍵のファイルの ~ を展開する", () => {
  assert.deepEqual(sshTargetArgs({ host: "bastion", port: null, user: null, identity_file: null }), ["bastion"]);
  assert.deepEqual(sshTargetArgs({ host: "b.example.com", port: 2222, user: "ec2-user", identity_file: "~/.ssh/id_ed25519" }), [
    "-p",
    "2222",
    "-l",
    "ec2-user",
    "-i",
    path.join(os.homedir(), ".ssh/id_ed25519"),
    "b.example.com",
  ]);
  assert.deepEqual(sshTargetArgs({ host: "h", port: null, user: null, identity_file: "/keys/a.pem" }), ["-i", "/keys/a.pem", "h"]);
});

test("parseSshConfigDump: 小文字のキーで、最初の値を使う", () => {
  const dump = parseSshConfigDump("hostname 10.0.0.5\nport 2222\nHostKeyAlias none\nidentityfile ~/.ssh/a\nidentityfile ~/.ssh/b\nproxyjump jump.example.com\n");
  assert.equal(dump.get("hostname"), "10.0.0.5");
  assert.equal(dump.get("port"), "2222");
  assert.equal(dump.get("hostkeyalias"), "none");
  assert.equal(dump.get("identityfile"), "~/.ssh/a");
  assert.equal(dump.get("proxyjump"), "jump.example.com");
});

test("knownHostsName: 22 番は名前だけ、ほかは [名前]:ポート、別名があればそれ", () => {
  assert.equal(knownHostsName("example.com", 22, null), "example.com");
  assert.equal(knownHostsName("example.com", 2222, null), "[example.com]:2222");
  assert.equal(knownHostsName("example.com", 2222, "bastion-prod"), "bastion-prod");
});

test("sshFingerprint: ssh-keygen -l と同じ SHA256:（末尾の = なし）", () => {
  const blob = Buffer.from("not really a key, but bytes");
  const expected = crypto.createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
  assert.equal(sshFingerprint(blob.toString("base64")), `SHA256:${expected}`);
  assert.doesNotMatch(sshFingerprint(blob.toString("base64")), /=$/);
});

test("parseKeyscan: コメント・空の行・欠けた行を飛ばす", () => {
  const out = "# example.com:22 SSH-2.0-OpenSSH_9.6\nexample.com ssh-ed25519 AAAAC3Nz\n\nexample.com ecdsa-sha2-nistp256 AAAAE2Vj\nbroken\n";
  assert.deepEqual(parseKeyscan(out), [
    { type: "ssh-ed25519", key: "AAAAC3Nz" },
    { type: "ecdsa-sha2-nistp256", key: "AAAAE2Vj" },
  ]);
  assert.deepEqual(parseKeyscan(""), []);
});

test("parseSshConfigHosts: 型（* ? !）を除き、同じ名前は 1 つ", () => {
  const config = "Host *\n  ServerAliveInterval 30\nHost bastion bastion-stg\n  HostName 1.2.3.4\n  host  db-jump\nHost !nope web-? bastion\nMatch host x\n";
  assert.deepEqual(parseSshConfigHosts(config), ["bastion", "bastion-stg", "db-jump"]);
});

test("ssh の失敗の見分け: 初めてのサーバー・鍵が変わった・ログインできない", () => {
  const unknown = "No ED25519 host key is known for bastion and you have requested strict checking.\nHost key verification failed.";
  const changed = "@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.";
  assert.equal(isUnknownHostKey(unknown), true);
  assert.equal(isChangedHostKey(unknown), false);
  assert.equal(isUnknownHostKey(changed), false);
  assert.equal(isChangedHostKey(changed), true);

  assert.ok(tunnelError("bastion", unknown).startsWith(`${DB_SSH_UNKNOWN_HOST}: `));
  assert.match(tunnelError("bastion", changed), /前に受け入れたものと違います/);
  assert.match(tunnelError("bastion", "ec2-user@bastion: Permission denied (publickey)."), /ログインできません.*Permission denied/);
  assert.match(tunnelError("bastion", "a\nb\nssh: connect to host bastion port 22: Connection refused\nc\n"), /^SSH トンネルを開けませんでした（bastion）: b \/ ssh: connect.* \/ c$/);
  assert.match(tunnelError("bastion", ""), /ssh が終わりました/);
});
