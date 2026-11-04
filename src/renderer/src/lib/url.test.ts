import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeUrl } from "./url";

test("アドレス欄: URL らしければ開き、それ以外は Google で検索する", () => {
  assert.equal(normalizeUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeUrl("127.0.0.1:5173/app"), "http://127.0.0.1:5173/app");
  assert.equal(normalizeUrl("devbox:8080"), "http://devbox:8080");
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("docs.anthropic.com/en/home?x=1"), "https://docs.anthropic.com/en/home?x=1");
  assert.equal(normalizeUrl("https://github.com"), "https://github.com");
  assert.equal(normalizeUrl("react hooks"), "https://www.google.com/search?q=react%20hooks");
  assert.equal(normalizeUrl("electron"), "https://www.google.com/search?q=electron");
  assert.equal(normalizeUrl("日本語の検索"), `https://www.google.com/search?q=${encodeURIComponent("日本語の検索")}`);
  assert.equal(normalizeUrl("   "), "about:blank");
});
