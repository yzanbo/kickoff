// SSH トンネルの引数と ssh の出力の読み方: つなぐ先の引数・ssh -G・known_hosts の名前・keyscan・~/.ssh/config の Host・失敗の見分け
import assert from "node:assert/strict";
import { test } from "vitest";
import { isChangedHostKey, isUnknownHostKey, knownHostsName, parseKeyscan, parseSshConfigDump, parseSshConfigHosts, sshTargetArgs } from "./sshArgs";

const HOME = "/Users/me";

test("sshTargetArgs: 省いたものは渡さず、鍵のファイルの ~ を展開する", () => {
  assert.deepEqual(sshTargetArgs({ host: "bastion", port: null, user: null, identity_file: null }, HOME), ["bastion"]);
  assert.deepEqual(sshTargetArgs({ host: "b.example.com", port: 2222, user: "ec2-user", identity_file: "~/.ssh/id_ed25519" }, HOME), [
    "-p",
    "2222",
    "-l",
    "ec2-user",
    "-i",
    "/Users/me/.ssh/id_ed25519",
    "b.example.com",
  ]);
  assert.deepEqual(sshTargetArgs({ host: "h", port: null, user: null, identity_file: "/keys/a.pem" }, HOME), ["-i", "/keys/a.pem", "h"]);
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

test("ssh の失敗の見分け: 初めてのサーバー・鍵が変わった", () => {
  const unknown = "No ED25519 host key is known for bastion and you have requested strict checking.\nHost key verification failed.";
  const changed = "@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.";
  assert.equal(isUnknownHostKey(unknown), true);
  assert.equal(isChangedHostKey(unknown), false);
  assert.equal(isUnknownHostKey(changed), false);
  assert.equal(isChangedHostKey(changed), true);

});
