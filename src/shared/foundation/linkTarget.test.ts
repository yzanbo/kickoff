import assert from "node:assert/strict";
import { test } from "vitest";
import { linkTargetOf, webLinkOf } from "./linkTarget";

test("linkTargetOf: http・https は読み直した URL（確認の画面に出す形と開く形が同じ）", () => {
  assert.deepEqual(linkTargetOf("https://example.com/a?b=1#c"), { kind: "web", url: "https://example.com/a?b=1#c" });
  assert.deepEqual(linkTargetOf("HTTP://Example.COM"), { kind: "web", url: "http://example.com/" });
  // //host は https として読む
  assert.deepEqual(linkTargetOf("//evil.example/x"), { kind: "web", url: "https://evil.example/x" });
  // スラッシュが 1 つ・逆スラッシュでも、ブラウザと同じ読み方の行き先を出す（書いた文字列のまま渡さない）
  assert.deepEqual(linkTargetOf("https:/evil.example"), { kind: "web", url: "https://evil.example/" });
  assert.deepEqual(linkTargetOf("https:\\\\evil.example\\a"), { kind: "web", url: "https://evil.example/a" });
  // 国際化ドメイン名は punycode の形
  assert.deepEqual(linkTargetOf("https://例え.jp/"), { kind: "web", url: "https://xn--r8jz45g.jp/" });
});

test("linkTargetOf: 相対のパス・ほかのスキーム・読めない URL はリンクにしない", () => {
  for (const href of ["/\\evil.example", "/api/projects", "./a.md", "a.md", "src/a.ts#L12", "mailto:a@example.com", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "http://", "https://", "", "#"]) {
    assert.equal(linkTargetOf(href), null, href);
  }
  assert.equal(linkTargetOf(undefined), null);
  assert.equal(linkTargetOf(1), null);
});

test("linkTargetOf: 改行・制御文字・空白（全角・ゼロ幅も）を含むものは断る", () => {
  for (const href of ["https://exa\nmple.com", "https://example.com/\t", "java\nscript:alert(1)", "https://example.com/a b", "https://example.com/\u3000", "https://exa\u200bmple.com", "https://example.com/\u0000", " https://example.com", "#a b"]) {
    assert.equal(linkTargetOf(href), null, JSON.stringify(href));
  }
});

test("linkTargetOf: # で始まるものは同じ文書の中の場所（% の形は戻す）", () => {
  assert.deepEqual(linkTargetOf("#user-content-fn-1"), { kind: "fragment", id: "user-content-fn-1" });
  assert.deepEqual(linkTargetOf("#%E8%A6%8B%E5%87%BA%E3%81%97"), { kind: "fragment", id: "見出し" });
  assert.deepEqual(linkTargetOf("#%E0%A4%A"), { kind: "fragment", id: "%E0%A4%A" });
});

test("webLinkOf: 外のページの URL だけ", () => {
  assert.equal(webLinkOf("//github.com/o/r"), "https://github.com/o/r");
  assert.equal(webLinkOf("#a"), null);
  assert.equal(webLinkOf("/api/x"), null);
});
