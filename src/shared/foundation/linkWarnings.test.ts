import { test } from "vitest";
import assert from "node:assert/strict";
import { linkDomainOf, linkWarnings } from "./linkWarnings";

test("linkWarnings: リンクの文字がドメインに見え、行き先のホストと違えば text_mismatch（www. とサブドメインは同じとみなす）", () => {
  assert.deepEqual(linkWarnings("https://evil.example/login", "www.mhlw.go.jp"), ["text_mismatch"]);
  assert.deepEqual(linkWarnings("https://www.mhlw.go.jp/a", "mhlw.go.jp"), []);
  assert.deepEqual(linkWarnings("https://docs.example.com/a", "example.com"), []);
  assert.deepEqual(linkWarnings("https://example.com/a", "https://example.com/b"), []);
  // ドメインに見えない文字なら比べない
  assert.deepEqual(linkWarnings("https://evil.example/", "こちら"), []);
  assert.deepEqual(linkWarnings("https://evil.example/"), []);
});

test("linkWarnings: ユーザー名入り・国際化ドメイン名・IP アドレス（この Mac の中は除く）", () => {
  assert.deepEqual(linkWarnings("https://google.com@evil.example/"), ["userinfo"]);
  assert.deepEqual(linkWarnings("https://аpple.com/"), ["idn"]);
  assert.deepEqual(linkWarnings("http://203.0.113.5/a"), ["ip"]);
  assert.deepEqual(linkWarnings("http://[2001:db8::1]/a"), ["ip"]);
  assert.deepEqual(linkWarnings("http://127.0.0.1:3000/"), []);
  assert.deepEqual(linkWarnings("http://localhost:5173/"), []);
  // http(s) でなければ見ない
  assert.deepEqual(linkWarnings("mailto:a@example.com"), []);
});

test("linkDomainOf: 「今後確認しない」はホスト名の小文字（ポートなし）で覚える", () => {
  assert.equal(linkDomainOf("https://Docs.Example.com:8443/a"), "docs.example.com");
  assert.equal(linkDomainOf("mailto:a@example.com"), null);
});
