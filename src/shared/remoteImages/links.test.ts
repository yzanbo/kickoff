import { test } from "vitest";
import assert from "node:assert/strict";
import { isLocalImagePath, remoteImageOf } from "./remoteImages";

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
