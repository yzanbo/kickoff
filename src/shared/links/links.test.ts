import { test } from "vitest";
import assert from "node:assert/strict";
import { imageSourcesIn, isLocalImagePath, remoteImageOf } from "./remoteImages";
import { linkDomainOf, linkWarnings } from "./linkWarnings";

test("remoteImageOf: http(s) の画像はホスト（小文字・ポート付き）と https かを返す", () => {
  assert.deepEqual(remoteImageOf("https://Example.COM/a.png"), { url: "https://example.com/a.png", host: "example.com", secure: true });
  assert.deepEqual(remoteImageOf("http://example.com:8080/a.png"), { url: "http://example.com:8080/a.png", host: "example.com:8080", secure: false });
  // // で始まるものは https とみなす
  assert.equal(remoteImageOf("//cdn.example.com/a.png")?.url, "https://cdn.example.com/a.png");
});

test("remoteImageOf: ユーザー名・パスワード入り・ほかのスキーム・パスは外の画像にしない", () => {
  assert.equal(remoteImageOf("https://user:pass@example.com/a.png"), null);
  assert.equal(remoteImageOf("data:image/png;base64,AAAA"), null);
  assert.equal(remoteImageOf("javascript:alert(1)"), null);
  assert.equal(remoteImageOf("./images/a.png"), null);
  assert.equal(remoteImageOf("https://"), null);
});

test("isLocalImagePath: スキームも // もないものだけを手元のパスにする", () => {
  assert.equal(isLocalImagePath("docs/a.png"), true);
  assert.equal(isLocalImagePath("/Users/me/a.png"), true);
  assert.equal(isLocalImagePath("https://example.com/a.png"), false);
  assert.equal(isLocalImagePath("//example.com/a.png"), false);
  assert.equal(isLocalImagePath("data:image/png;base64,AAAA"), false);
  assert.equal(isLocalImagePath("  "), false);
});

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

test("imageSourcesIn: Markdown の画像の src を書いた順に拾う（題名・<> 囲みも読む）", () => {
  const md = '前 ![a](https://x.example/a.png) 中 ![b](<docs/b.png> "題") ![c](https://x.example/c.png \'t\')\n[リンク](https://x.example/) 後';
  assert.deepEqual(imageSourcesIn(md), ["https://x.example/a.png", "docs/b.png", "https://x.example/c.png"]);
  assert.deepEqual(imageSourcesIn("画像なし"), []);
});
