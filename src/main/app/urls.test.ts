import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmbeddableUrl, isWebUrl, sameOrigin } from "./urls.js";

test("外で開いてよいページ: http(s) だけ。埋め込みブラウザは空のページも", () => {
  assert.equal(isWebUrl("https://example.com/a"), true);
  assert.equal(isWebUrl("http://localhost:3000"), true);
  assert.equal(isWebUrl("file:///etc/passwd"), false);
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl(undefined), false);
  assert.equal(isEmbeddableUrl("about:blank"), true);
  assert.equal(isEmbeddableUrl("https://example.com/"), true);
  assert.equal(isEmbeddableUrl("file:///etc/passwd"), false);
});

test("同じ出どころ: スキーム・ホスト・ポートが同じとき。URL として読めなければ違う", () => {
  assert.equal(sameOrigin("http://127.0.0.1:4318/#/projects/1", "http://127.0.0.1:4318"), true);
  assert.equal(sameOrigin("http://127.0.0.1:4319/", "http://127.0.0.1:4318"), false);
  assert.equal(sameOrigin("http://localhost:4318/", "http://127.0.0.1:4318"), false);
  assert.equal(sameOrigin("", "http://127.0.0.1:4318"), false);
});
