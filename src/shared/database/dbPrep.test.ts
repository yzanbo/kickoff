// つなぐ前の準備のコマンド: {名前} の埋め方（シェルの 1 語に）・使う名前・空の整理・確かめた中身の写し・次に確かめる日
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbPrep } from "../types/database";
import { allPrepCommands, expandPrepCommand, hasConnectCommands, isCheckDue, localToday, normalizePrep, prepConfirmKey, prepPlaceholders, shellQuote, usesMyIp } from "./dbPrep";

const prep = (patch: Partial<DbPrep> = {}): DbPrep => ({ prepare: [], cleanup: [], tunnel: null, password: null, my_ip_url: null, ...patch });

test("expandPrepCommand: 値はシェルの 1 語で入れ、知らない {…} はそのまま。ない値は投げる", () => {
  assert.equal(
    expandPrepCommand("aws ec2 authorize-security-group-ingress --cidr {my_ip}/32 --port {port}", { my_ip: "203.0.113.5", port: "5432" }),
    "aws ec2 authorize-security-group-ingress --cidr '203.0.113.5'/32 --port '5432'",
  );
  assert.equal(expandPrepCommand("echo {user} {other}", { user: "o'neil; rm -rf ~" }), `echo 'o'\\''neil; rm -rf ~' {other}`);
  assert.throws(() => expandPrepCommand("ssm --local {local_port}", {}), /\{local_port\}/);
  assert.throws(() => expandPrepCommand("x {host}", { host: null }), /\{host\}/);
  assert.equal(shellQuote(""), "''");
});

test("prepPlaceholders・usesMyIp: 使う名前を 1 つずつ", () => {
  assert.deepEqual(prepPlaceholders("a {host} {port} {host} {nope}"), ["host", "port"]);
  assert.equal(usesMyIp(["aws sso login", "revoke --cidr {my_ip}/32"]), true);
  assert.equal(usesMyIp(["aws sso login"]), false);
});

test("normalizePrep: 空の行・空の欄を落とし、何もなければ null", () => {
  assert.equal(normalizePrep(null), null);
  assert.equal(normalizePrep(prep({ prepare: ["  ", ""], tunnel: " ", my_ip_url: "https://x" })), null);
  assert.deepEqual(normalizePrep(prep({ prepare: [" aws sso login ", ""], password: " op read x ", my_ip_url: " " })), prep({ prepare: ["aws sso login"], password: "op read x" }));
});

test("allPrepCommands・hasConnectCommands・prepConfirmKey", () => {
  const p = prep({ prepare: ["a"], cleanup: ["b"], tunnel: "t {local_port}", password: "p" });
  assert.deepEqual(allPrepCommands(p), ["a", "b", "t {local_port}", "p"]);
  assert.equal(hasConnectCommands(p), true);
  assert.equal(hasConnectCommands(prep({ prepare: ["a"] })), false);
  assert.equal(hasConnectCommands(null), false);
  // 中身・問い合わせ先が変われば写しも変わる
  assert.notEqual(prepConfirmKey(p), prepConfirmKey({ ...p, cleanup: ["c"] }));
  assert.notEqual(prepConfirmKey(p), prepConfirmKey({ ...p, my_ip_url: "https://example.com" }));
  assert.equal(prepConfirmKey(p), prepConfirmKey({ ...p }));
});

test("isCheckDue・localToday: 当日から印を出す", () => {
  assert.equal(isCheckDue(null, "2026-11-11"), false);
  assert.equal(isCheckDue("2026-11-12", "2026-11-11"), false);
  assert.equal(isCheckDue("2026-11-11", "2026-11-11"), true);
  assert.equal(isCheckDue("2026-10-01", "2026-11-11"), true);
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});
