import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { scrollToFragment } from "./markdownLinks";

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

/** 偽の Markdown の表示（返答 1 つ）: 中の ID の要素と、スクロールした記録（どの返答の何か） */
function fakeReply(name: string, ids: string[], scrolled: string[]) {
  const targets = new Map(ids.map((id) => [id, { scrollIntoView: () => void scrolled.push(`${name}:${id}`) }]));
  const root = { querySelector: (selector: string) => targets.get(selector.replace(/^#/, "").replace(/\\/g, "")) ?? null };
  return { closest: (selector: string) => (selector === ".markdown" ? root : null) } as unknown as Element;
}

test("scrollToFragment: 押したリンクの返答の中の ID へスクロールし、ほかの返答・行き先がないときは何もしない", () => {
  vi.stubGlobal("CSS", { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) });
  const scrolled: string[] = [];
  const first = fakeReply("1つ目", ["user-content-fn-1"], scrolled);
  const second = fakeReply("2つ目", ["user-content-fn-1", "user-content-fn-2"], scrolled);
  scrollToFragment(second, "user-content-fn-1");
  scrollToFragment(first, "user-content-fn-1");
  // 1 つ目の返答にない行き先は、2 つ目の返答にあっても動かない
  scrollToFragment(first, "user-content-fn-2");
  scrollToFragment({ closest: () => null } as unknown as Element, "user-content-fn-1");
  assert.deepEqual(scrolled, ["2つ目:user-content-fn-1", "1つ目:user-content-fn-1"]);
});
