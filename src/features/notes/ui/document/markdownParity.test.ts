// ノートの編集の画面（@lezer/markdown）が飾る書き方と、返答の表示（micromark）が描く書き方を、同じ見本の文で比べる。
// 2 つの読み取りは別物なので、ずれた所はノートの側で返答の表示に合わせる（ずれを見つける網）
import assert from "node:assert/strict";
import { test } from "vitest";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { markdownRemarkPlugins } from "@/foundation/ui/markdown/syntax/markdownPlugins";
import { cjkFriendlyEmphasis } from "./cjkEmphasis";
import { linkDefinitions, linkHref } from "./noteLinks";

/** ノートの編集の部品と同じ読み取り（NoteEditor の markdown() と同じ組） */
const noteParser = (markdownLanguage.parser as MarkdownParser).configure([cjkFriendlyEmphasis]);
const chatParser = unified().use(remarkParse).use(markdownRemarkPlugins());

type Kind = "link" | "heading" | "code";

/** 返答の表示が描くもの（種類と、文の中の位置の範囲） */
function chatSummary(text: string, kinds: readonly Kind[]): string[] {
  const out: string[] = [];
  visit(chatParser.parse(text) as Root, (node) => {
    const at = `${node.position?.start.offset}-${node.position?.end.offset}`;
    // [ ] で書いたリンクだけ（URL のそのまま書き・<URL> は別に比べる）
    if (kinds.includes("link") && (node.type === "link" || node.type === "linkReference") && text[node.position?.start.offset ?? 0] === "[") out.push(`link ${at}`);
    if (kinds.includes("heading") && node.type === "heading") out.push(`heading${node.depth} ${at}`);
    if (kinds.includes("code") && node.type === "code") out.push(`code ${node.position?.start.line}-${node.position?.end.line}`);
  });
  return out.sort();
}

/** ノートの編集の画面が飾るもの（chatSummary と同じ形） */
function noteSummary(text: string, kinds: readonly Kind[]): string[] {
  const tree = noteParser.parse(text);
  const defs = linkDefinitions(tree, text);
  const out: string[] = [];
  const lineOf = (pos: number) => text.slice(0, pos).split("\n").length;
  tree.iterate({
    enter(n) {
      const at = `${n.from}-${n.to}`;
      if (kinds.includes("link") && n.name === "Link" && linkHref(n.node, text, defs) !== null) out.push(`link ${at}`);
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
      // 見出しの終わりは返答の表示に合わせて行の終わりの空白を数えない
      if (kinds.includes("heading") && heading) out.push(`heading${heading[1]} ${n.from}-${n.from + text.slice(n.from, n.to).trimEnd().length}`);
      // コードの塊は行で比べる（字下げのコードの頭を、lezer は字下げの後ろ・micromark は行の頭にする）
      if (kinds.includes("code") && (n.name === "FencedCode" || n.name === "CodeBlock")) out.push(`code ${lineOf(n.from)}-${lineOf(n.to)}`);
    },
  });
  return out.sort();
}

const same = (text: string, kinds: readonly Kind[]) => assert.deepEqual(noteSummary(text, kinds), chatSummary(text, kinds), text);

test("読み方の比べ: 行き先のあるリンクだけをリンクにする（定義のない [文字] は文字のまま）", () => {
  for (const text of [
    "[文](https://x.y) と [空]() と [相対](../a.md)",
    "[文][名前] と [名前] と [名前][]\n\n[名前]: https://x.y",
    "大文字・小文字を区別しない [Foo] と [foo  bar]\n\n[FOO]: a\n[Foo Bar]: b",
    "引用とリストの中の定義も効く [q] [l]\n\n> [q]: https://q\n\n- [l]: https://l",
    // 定義のない角かっこ（実際のノートにある形）
    "配列 [2, 3]、キー ⌘[ ⌘]、印 [?]、札 [再開]、[文][ない]",
    "脚注の印 x[^1] は文字のまま\n\n[^1]: 注",
    "表の中 | [a] | [b](u) |",
  ]) {
    same(text, ["link"]);
  }
});

test("読み方の比べ: 見出し（# と下線）とコードの塊は同じ所を同じに読む", () => {
  for (const text of ["# 一\n\n## 二 ##\n\n見出し\n===\n\n下線2\n---\n\n本文", "```ts\nconst a = 1;\n```\n\n~~~\nb\n~~~\n\n    字下げ\n\n- 項目\n\n  ```js\n  c\n  ```"]) {
    same(text, ["heading", "code"]);
  }
});

test("読み方の比べ: 画像の中の [ ] はリンクにしない（![[名前]] は返答の表示でも文字のまま）", () => {
  same("![[Pasted image 1.png]] と ![説明](a.png)", ["link"]);
});
