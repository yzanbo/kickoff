import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, null, text));

test("Markdown のリンク: http・https と //host は読み直した URL の href（target は付けない）", () => {
  assert.equal(html("[a](https://example.com/x)"), '<div class="markdown"><p><a href="https://example.com/x" rel="noreferrer">a</a></p></div>');
  assert.match(html("[a](//evil.example/x)"), /<a href="https:\/\/evil\.example\/x" rel="noreferrer">a<\/a>/);
  assert.match(html("[a](https:/evil.example)"), /<a href="https:\/\/evil\.example\/" rel="noreferrer">a<\/a>/);
  assert.doesNotMatch(html("[a](https://example.com/x)"), /target=/);
});

test("Markdown のリンク: 相対のパス・mailto: などはリンクにせず文字だけ", () => {
  for (const href of ["/\\evil.example", "/api/projects", "./a.md", "mailto:a@example.com"]) {
    assert.equal(html(`[文字](${href})`), "<div class=\"markdown\"><p>文字</p></div>", href);
  }
});

test("Markdown のリンク: # で始まるものは href を # のまま（窓は開かない）", () => {
  assert.match(html("[見出し](#a)"), /<a href="#a" rel="noreferrer">見出し<\/a>/);
});
