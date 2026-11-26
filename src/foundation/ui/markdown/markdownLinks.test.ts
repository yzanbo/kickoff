import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import type { Element as HastElement } from "hast";
import { visit } from "unist-util-visit";
import { linkWarnings } from "@shared/foundation/linkWarnings";
import { linkTextOf, pressLink, scrollToFragment } from "./markdownLinks";
import { markdownToHast, pipelineOf, type MarkdownPipeline } from "./markdownProcessor";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { mathPluginsOf } from "./math/mathPlugins";

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

test("Markdown の脚注: 番号と戻る印のリンクは id・説明を残す（戻る印の行き先は番号の id）", () => {
  const out = html("本文[^1]。\n\n[^1]: 注");
  assert.match(out, /<a href="#user-content-fn-1" id="user-content-fnref-1" aria-describedby="footnote-label" rel="noreferrer">1<\/a>/);
  assert.match(out, /<a href="#user-content-fnref-1" aria-label="本文の注 1 へ戻る" rel="noreferrer">↩<\/a>/);
  assert.match(out, /<li id="user-content-fn-1">/);
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

test("scrollToFragment: Markdown のリンクの #x は、HTML に書いた id（user-html-x）も探す。脚注の行き先は HTML の要素に取られない", () => {
  vi.stubGlobal("CSS", { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) });
  const scrolled: string[] = [];
  const reply = fakeReply("返答", ["user-content-fn-1", "user-html-fn-1", "user-html-install"], scrolled);
  scrollToFragment(reply, "install");
  scrollToFragment(reply, "user-content-fn-1");
  assert.deepEqual(scrolled, ["返答:user-html-install", "返答:user-content-fn-1"]);
});

/** 返答と同じ組で読んだ、最初のリンク（a）の要素 */
function firstLink(markdown: string, pipeline: MarkdownPipeline = pipelineOf(undefined, null)): HastElement {
  const tree = markdownToHast(pipeline, markdown);
  assert.ok(tree, markdown);
  let found: HastElement | undefined;
  visit(tree, "element", (node: HastElement) => {
    if (!found && node.tagName === "a") found = node;
  });
  assert.ok(found, markdown);
  return found;
}

test("linkTextOf: リンクの中の画像の alt も文字に数え、alt のドメインと行き先が違えば警告する", () => {
  const node = firstLink("[![apple.com](javascript:x)](https://evil.example)");
  assert.match(linkTextOf(node), /apple\.com/);
  assert.deepEqual(linkWarnings("https://evil.example", linkTextOf(node)), ["text_mismatch"]);
  // alt と前後の文字はつながらない
  assert.equal(linkTextOf(firstLink("[a![b](https://example.com/i.png)c](https://example.com)")).replace(/\s+/g, " "), "a b c");
});

test("linkTextOf: リンクの中の数式は見た目の部分だけを読み（読み上げ用の MathML・書いた式・透明な文字を除く）、行き先と違えば警告する", () => {
  // 返答と同じ組（useMathPlugins.ts の数式の部品）
  const math = pipelineOf(undefined, mathPluginsOf(remarkMath, rehypeKatex));
  const text = linkTextOf(firstLink("[$\\text{apple.com}$](https://evil.example)", math));
  assert.equal(text, "apple.com");
  assert.deepEqual(linkWarnings("https://evil.example", text), ["text_mismatch"]);
  assert.equal(linkTextOf(firstLink("[$a\\phantom{b}c$](https://example.com)", math)), "ac");
});

test("pressLink: 左・中クリックだけ既定の動きを止め、外のページは読み直した URL とリンクの文字で開く口へ渡す", () => {
  const press = (button: number, href: string | null, defaultPrevented = false) => {
    const e = { button, defaultPrevented, preventDefault: vi.fn() };
    const opener = vi.fn();
    const anchor = href === null ? null : ({ getAttribute: () => href } as unknown as Element);
    pressLink(e as never, anchor, opener, () => "文字");
    return { prevented: e.preventDefault.mock.calls.length > 0, opened: opener.mock.calls.map((c: unknown[]) => c.slice(1)) };
  };
  assert.deepEqual(press(0, "HTTPS://Example.com"), { prevented: true, opened: [["https://example.com/", "文字"]] });
  assert.deepEqual(press(1, "https://example.com/a"), { prevented: true, opened: [["https://example.com/a", "文字"]] });
  // 右クリック・ほかが止めた押下・リンクの外は何もしない
  assert.deepEqual(press(2, "https://example.com/"), { prevented: false, opened: [] });
  assert.deepEqual(press(0, "https://example.com/", true), { prevented: false, opened: [] });
  assert.deepEqual(press(0, null), { prevented: false, opened: [] });
  // リンクにしない行き先は、窓の既定の動きだけ止めて開かない
  assert.deepEqual(press(0, "javascript:alert(1)"), { prevented: true, opened: [] });
});
