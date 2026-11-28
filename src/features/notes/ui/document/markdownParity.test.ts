// ノートの編集の画面（@lezer/markdown）が飾る書き方と、返答の表示（micromark）が描く書き方を、同じ見本の文で比べる。
// 2 つの読み取りは別物なので、ずれた所はノートの側で返答の表示に合わせる（ずれを見つける網）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { markdownRemarkPlugins } from "@/foundation/ui/markdown/syntax/markdownPlugins";
import { footnotes } from "./footnotes";
import { bareUrlEnd, isBareUrl, linkDefinitions, linkHref } from "./noteLinks";
import { noteMarkdownParser as noteParser } from "./noteMarkdown";
import { splitTableRow, tableBlocks } from "./tableBlocks";

const chatParser = unified().use(remarkParse).use(markdownRemarkPlugins());

type Kind = "link" | "url" | "heading" | "code" | "table" | "footnote";

/** 返答の表示が描くもの（種類と、文の中の位置の範囲） */
function chatSummary(text: string, kinds: readonly Kind[]): string[] {
  const out: string[] = [];
  visit(chatParser.parse(text) as Root, (node) => {
    const at = `${node.position?.start.offset}-${node.position?.end.offset}`;
    // [ ] で書いたリンクだけ（URL のそのまま書き・<URL> は別に比べる）
    if (kinds.includes("link") && (node.type === "link" || node.type === "linkReference") && text[node.position?.start.offset ?? 0] === "[") out.push(`link ${at}`);
    // URL のそのまま書きと <URL>（[ ] で書いていないリンク）
    if (kinds.includes("url") && node.type === "link" && text[node.position?.start.offset ?? 0] !== "[") out.push(`url ${at}`);
    if (kinds.includes("footnote") && node.type === "footnoteReference") out.push(`ref ${at}`);
    if (kinds.includes("footnote") && node.type === "footnoteDefinition") out.push(`def ${node.position?.start.line}-${node.position?.end.line}`);
    if (kinds.includes("heading") && node.type === "heading") out.push(`heading${node.depth} ${at}`);
    // 表は行で比べる（始まり・終わりの行と、行の数・見出しのセルの数）
    if (kinds.includes("table") && node.type === "table") out.push(`table ${node.position?.start.line}-${node.position?.end.line} ${node.children.length}x${node.children[0]?.children.length}`);
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
  if (kinds.includes("footnote")) {
    const notes = footnotes(tree, text);
    for (const r of notes.refs) out.push(`ref ${r.from}-${r.to}`);
    for (const d of notes.defs.values()) out.push(`def ${lineOf(d.from)}-${lineOf(d.to)}`);
  }
  if (kinds.includes("table")) {
    for (const t of tableBlocks(tree, text)) {
      const body = t.rows.filter((r) => !r.delimiter);
      out.push(`table ${lineOf(t.from)}-${lineOf(t.to)} ${body.length}x${splitTableRow(text.slice(body[0].from, body[0].to), 0).length}`);
    }
  }
  tree.iterate({
    enter(n) {
      const at = `${n.from}-${n.to}`;
      if (kinds.includes("link") && n.name === "Link" && linkHref(n.node, text, defs) !== null) out.push(`link ${at}`);
      if (kinds.includes("url") && n.name === "Autolink") out.push(`url ${at}`);
      if (kinds.includes("url") && isBareUrl(n.node)) out.push(`url ${n.from}-${bareUrlEnd(text, n.from, n.to)}`);
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

test("読み方の比べ: 表は同じ行から同じ行までを、同じ行と列の数で読む", () => {
  for (const text of [
    "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |",
    "a | b\n--|--\n1 | 2",
    "本文\n| a | b |\n|---|---|\n| 1 | 2 |",
    // | で始まる段落の途中の行から始まる表（実際のノートにある形）
    "| x | y | z |\n| p | q | r |\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |",
    "| x | y |\n| a | b |\n|---|---|\n| 1 | 2 |\n\n| 後 | ろ |\n|---|---|",
    "| セルの中の \\| と `コード` | b |\n|:--|--:|\n| 1 || 3 |\n| 短い |",
    "- 項目\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |",
    "> | a | b |\n> |---|---|\n> | 1 | 2 |",
  ]) {
    same(text, ["table"]);
  }
});

test("読み方の比べ: URL のそのまま書きと <URL> は同じ所までをリンクにする（日本語の記号の手前で終える）", () => {
  for (const text of [
    "見る https://example.com/a。次の文",
    "<https://example.com> と http://x.y/z?q=1 、",
    "（https://example.com）を開く",
    "https://ja.wikipedia.org/wiki/東京都 は 1 つ",
    "www.example.com も",
  ]) {
    same(text, ["url"]);
  }
});

test("読み方の比べ: 脚注は定義のある名前の印だけ、定義は字下げした続きの行まで", () => {
  for (const text of [
    "本文[^a]と[^b]と[^a]と[^ない]\n\n[^b]: 長い 注の文\n    続きの行\n[^a]: 注 A",
    "コードの中 `[^a]` は印でない[^a]\n\n[^a]: 注",
    "```\n[^a]: コードの中\n```",
  ]) {
    same(text, ["footnote"]);
  }
});
