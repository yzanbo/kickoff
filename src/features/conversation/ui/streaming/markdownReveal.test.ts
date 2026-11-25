import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { pipelineOf, renderMarkdown } from "@/foundation/ui/markdown/markdownProcessor";
import { createBlockScanner } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import { markdownRemarkPlugins } from "@/foundation/ui/markdown/syntax/markdownPlugins";
import { createMarkdownRevealLimit, cutText, MAX_SCAN, revealCut } from "./markdownReveal";
import { MAX_BLOCK_HOLD, MAX_INLINE_HOLD } from "./markdownRevealInline";

/** text の shown 文字目まで出したいときに描く文（読み取りは新しく作る） */
const reveal = (text: string, shown = text.length) => cutText(text, revealCut(text, shown, createBlockScanner()));

/** [書きかけの文, 描く文] の組を確かめる */
function check(cases: [string, string][]) {
  for (const [input, expected] of cases) assert.equal(reveal(input), expected, JSON.stringify(input));
}

test("ちらつきの例: 強調・コードは閉じの記号を補い、リンクの行き先・数式・表・setext・行の頭の印・言語名・文字参照は手前で止める", () => {
  check([
    ["これは **大事", "これは **大事**"],
    ["[説明](https://exa", "説明"],
    ["`npm ru", "`npm ru`"],
    ["$x^", ""],
    ["| 列1 | 列2 |", ""],
    ["段落\n-", "段落\n"],
    ["```ty", ""],
    ["1", ""],
    ["&am", ""],
    ["これは **大事**", "これは **大事**"],
  ]);
});

test("補う: 入れ子は内側から閉じ、取り消し線・_ の強調も補う。文の終わりの印の並びは手前で止める", () => {
  check([
    ["**太字と *斜体", "**太字と *斜体***"],
    ["~~消した", "~~消した~~"],
    ["_強調", "_強調_"],
    ["これは **", "これは "],
    ["これは **大事** で *", "これは **大事** で "],
    ["`a` と **b", "`a` と **b**"],
    ["**太字と `コード", "**太字と `コード`**"],
    ["**太字 ", "**太字**"],
    ["**太字\n", "**太字**"],
  ]);
});

test("止めない・補わない: 空白に挟まれた *・語の中の _・箇条書き・値段・閉じたコードの中・コードブロックの中・エスケープ", () => {
  check([
    ["2 * 3 = 6", "2 * 3 = 6"],
    ["snake_case_name", "snake_case_name"],
    ["* 箇条書き", "* 箇条書き"],
    ["価格は $5 です", "価格は $5 です"],
    ["`a*b` の", "`a*b` の"],
    ["```ts\nconst a = **b", "```ts\nconst a = **b"],
    ["\\*そのまま", "\\*そのまま"],
    ["echo $HOME と", "echo $HOME と"],
  ]);
});

test("リンク・画像: [ は外して中の文字を先に出し、行き先は出さない。画像は書き終えるまで出さない。リンクでない [ はそのまま", () => {
  check([
    ["[説明", "説明"],
    ["[説明]", "説明"],
    ["[説明](https://example.com) の", "[説明](https://example.com) の"],
    ["[説明][ref", "説明"],
    ["[注意] これは", "[注意] これは"],
    ["前 ![図](a.png", "前 "],
    ["前 <https://exa", "前 "],
    ["前 [^1", "前 "],
  ]);
});

test("止める上限: 閉じない [ のあと 121 字なら止めず、[ も外さない", () => {
  const long = "[" + "あ".repeat(MAX_INLINE_HOLD);
  assert.equal(reveal(long), long);
  assert.equal(reveal("[" + "あ".repeat(MAX_INLINE_HOLD - 1)), "あ".repeat(MAX_INLINE_HOLD - 1));
});

test("表: 見出しだけ・区切りの行の途中は表の頭で、区切りの行まで来たらすべて、行の途中はその行の頭で止める", () => {
  const head = "前の段落\n\n";
  check([
    [`${head}| a | b |`, head],
    [`${head}| a | b |\n`, head],
    [`${head}| a | b |\n|--`, head],
    [`${head}| a | b |\n|---|---|\n`, `${head}| a | b |\n|---|---|\n`],
    [`${head}| a | b |\n|---|---|\n| 1 | 2 |\n| 3`, `${head}| a | b |\n|---|---|\n| 1 | 2 |\n`],
    // 区切りの行でなければ表ではないので止めない
    [`${head}| a | b |\nふつう`, `${head}| a | b |\nふつう`],
  ]);
  // 止める長さが上限を超えたら止めない
  const wide = `| ${"x".repeat(MAX_BLOCK_HOLD)} |`;
  assert.equal(reveal(wide), wide);
});

test("コードブロック: 開きの行が改行まで来るまで出さず、閉じの書きかけはその行の頭で止める。数式ブロックは閉じまで止める", () => {
  check([
    ["前\n```mer", "前\n"],
    ["前\n```mermaid\ngraph TD", "前\n```mermaid\ngraph TD"],
    ["```ts\ncode\n``", "```ts\ncode\n"],
    ["```ts\ncode\n```", "```ts\ncode\n```"],
    ["前\n\n$$\nE = mc^2", "前\n\n"],
    ["$$\nE = mc^2\n$$", "$$\nE = mc^2\n$$"],
    ["式 \\(x^", "式 "],
  ]);
});

test("行の頭の印・setext: 印だけの行はその行の頭で止め、文字が来たら出す", () => {
  check([
    ["段落\n#", "段落\n"],
    ["段落\n##", "段落\n"],
    ["段落\n> ", "段落\n"],
    ["段落\n12.", "段落\n"],
    ["段落\n- 項目", "段落\n- 項目"],
    ["# 見出し", "# 見出し"],
    ["見出し\n===", "見出し\n"],
    ["見出し\n===\n本文", "見出し\n===\n本文"],
  ]);
});

test("前のブロックは止めない: 最後のブロックだけを見る", () => {
  check([
    ["| a |\n\n本文 **太", "| a |\n\n本文 **太**"],
    ["**閉じない\n\n次の段落", "**閉じない\n\n次の段落"],
    // 前の行の箇条書きの開いたままの印は、次の項目に持ち越さない
    ["- 項目 *半端\n- 次 **太", "- 項目 *半端\n- 次 **太**"],
  ]);
});

test("サロゲートペアの途中で切らない", () => {
  const text = "前 [😀";
  const cut = revealCut(text, text.length - 1, createBlockScanner());
  assert.equal(cut.length, 3);
  assert.equal(cutText(text, cut), "前 ");
});

test("長いブロックは最後の MAX_SCAN 文字だけを見る（前の閉じない記号は補わない）", () => {
  const text = "**" + "あ".repeat(MAX_SCAN) + "\n続き";
  assert.equal(reveal(text), text);
});

test("続きの文を少しずつ読んでも、初めから読んだときと同じ結果（増えた行だけ読む）", () => {
  const text = "# 見出し\n\n本文 **太字** と `code`。\n\n```ts\nconst a = 1;\n\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$$\nx\n$$\n\n- [リンク](https://a.b) *斜体*";
  const limit = createMarkdownRevealLimit();
  for (let shown = 0; shown <= text.length; shown++) {
    assert.equal(limit(text, shown).render, reveal(text, shown), `shown=${shown}`);
  }
  // 続きでない文が来たら読み直す
  assert.equal(limit("別の **返答", 9).render, "別の **返答**");
});

/** react-markdown と読み方の設定の組（Markdown の部品と同じ組）で HTML にする */
const render = (markdown: string) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: markdownRemarkPlugins() }, markdown));

test("生の記号が出ない: 例の文のどの書きかけでも、描いた HTML に生の ** ~~ ]( ` が出ない", () => {
  const text = "これは **大事な** 話で、~~古い~~ 方法ではなく `npm run build` を使う。[説明](https://example.com) も読む。\n\n| 列1 | 列2 |\n|---|---|\n| **a** | `b` |\n\n1. 番号\n2. 次";
  const limit = createMarkdownRevealLimit();
  for (let shown = 1; shown <= text.length; shown++) {
    const html = render(limit(text, shown).render).replace(/<code>[^<]*<\/code>/g, "");
    for (const raw of ["**", "~~", "](", "`"]) assert.ok(!html.includes(raw), `shown=${shown} ${raw}: ${html}`);
  }
});

test("日本語の強調・取り消し線（~ 1 つは文字のまま）: 表示と同じ決まりで補い、1 文字ずつ伸ばしても生の記号が出ず、書き終えたら確定の形と同じ", () => {
  check([
    ["**「強調", "**「強調**"],
    ["**「強調」**", "**「強調」**"],
    ["**ノート（.md）**と**チャット", "**ノート（.md）**と**チャット**"],
    ["~~取消（x）~~で", "~~取消（x）~~で"],
    // ~ 1 つは表示でも取り消し線にしないので、閉じを補わない
    ["所要時間は5~10秒、長く", "所要時間は5~10秒、長く"],
    ["~1 つ", "~1 つ"],
  ]);
  for (const text of ["**スポークスマン（spokesman）**は", "**ノート（.md）**と**チャット（.json）**の違い", "***強調（x）***は。~~取消（x）~~です", "所要時間は5~10秒、長くて20~30秒です"]) {
    const limit = createMarkdownRevealLimit();
    for (let shown = 1; shown <= text.length; shown++) {
      const html = render(limit(text, shown).render);
      for (const raw of ["**", "~~"]) assert.ok(!html.includes(raw), `${text} shown=${shown} ${raw}: ${html}`);
    }
    assert.equal(render(limit(text, text.length).render), render(text));
  }
});

test("HTML のタグ: 書きかけのタグ・コメントは手前で止め、文の中のタグは閉じのタグを補う。一覧にないタグ・比べる < は止めない", () => {
  check([
    ["前 <deta", "前 "],
    ["前 <details op", "前 "],
    ['前 <a href="https://exa', "前 "],
    ["前 <", "前 "],
    ["前 <!-- 目", "前 "],
    ["a <b>太", "a <b>太</b>"],
    ["a <b>太</b", "a <b>太</b>"],
    ["a <b>太</b> と <kbd>K", "a <b>太</b> と <kbd>K</kbd>"],
    ["**強 <i>斜", "**強 <i>斜</i>**"],
    ["x <y z", "x <y z"],
    ["a < b", "a < b"],
    ["a <br> b", "a <br> b"],
  ]);
});

test("HTML のタグ: 1 文字ずつ伸ばしても、描いた HTML に書きかけのタグが文字で出ず、書き終えたら確定の形と同じ", () => {
  const pipeline = pipelineOf(undefined, null);
  const draw = (markdown: string) => renderToStaticMarkup(renderMarkdown(pipeline, markdown, {}));
  const text = '押すのは <kbd>⌘</kbd>+<kbd>K</kbd> で、<b>太字</b>と <abbr title="説明">略</abbr> と H<sub>2</sub>O。';
  const limit = createMarkdownRevealLimit();
  for (let shown = 1; shown <= text.length; shown++) {
    const html = draw(limit(text, shown).render);
    assert.ok(!html.includes("&lt;"), `shown=${shown}: ${html}`);
  }
  assert.equal(draw(limit(text, text.length).render), draw(text));
});
