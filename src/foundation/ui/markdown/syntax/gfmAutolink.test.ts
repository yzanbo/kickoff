import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import type { Extension } from "micromark-util-types";
import type { Processor } from "unified";
import { createPipeline, pipelineOf, renderMarkdown } from "@/foundation/ui/markdown/markdownProcessor";
import { gfmAutolinkFromMarkdown, gfmAutolinkSyntax } from "./gfmAutolink";
import { isUrlStop } from "./urlStop";

type FromMarkdownExtension = ReturnType<typeof gfmAutolinkLiteralFromMarkdown>;

const html = (text: string) => renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), text, {}));
const link = (url: string, text = url) => `<a href="${url}">${text}</a>`;

/** 自動リンクの部品だけで読む処理（元の部品と止める版を、同じ形で比べる） */
const autolinkOnly = (syntax: () => Extension, fromMarkdown: () => FromMarkdownExtension) =>
  createPipeline(
    [
      function autolink(this: Processor) {
        const data = this.data();
        (data.micromarkExtensions ??= []).push(syntax());
        (data.fromMarkdownExtensions ??= []).push(fromMarkdown());
      },
    ],
    [],
  );
const original = autolinkOnly(gfmAutolinkLiteral, gfmAutolinkLiteralFromMarkdown);
const stopping = autolinkOnly(gfmAutolinkSyntax, gfmAutolinkFromMarkdown);

test("URL: 日本語の記号・句読点・全角の形・ひらがな・… ‥・曲がった引用符の手前で終える", () => {
  const cases: [string, string][] = [
    ["（https://example.com）を開く", `<p>（${link("https://example.com")}）を開く</p>`],
    ["https://example.com、次に", `<p>${link("https://example.com")}、次に</p>`],
    ["https://example.com。", `<p>${link("https://example.com")}。</p>`],
    ["…?b=1」と https://example.com/a?b=1」と", `<p>…?b=1」と ${link("https://example.com/a?b=1")}」と</p>`],
    ["【https://example.com】", `<p>【${link("https://example.com")}】</p>`],
    ["https://example.com〜次", `<p>${link("https://example.com")}〜次</p>`],
    ["https://example.com！", `<p>${link("https://example.com")}！</p>`],
    ["https://example.com／a", `<p>${link("https://example.com")}／a</p>`],
    ["https://example.comです", `<p>${link("https://example.com")}です</p>`],
    ["https://example.com/a…", `<p>${link("https://example.com/a")}…</p>`],
    ["https://example.com/a‥", `<p>${link("https://example.com/a")}‥</p>`],
    ["“https://example.com”", `<p>“${link("https://example.com")}”</p>`],
    ["‘https://example.com’", `<p>‘${link("https://example.com")}’</p>`],
    // 半角の記号のあとに止まる文字
    ["https://example.com.」", `<p>${link("https://example.com")}.」</p>`],
    // www. の形も同じ（文から探す段で拾うもの・読み取りの段で拾うもの）
    ["「www.example.com」です", `<p>「${link("http://www.example.com", "www.example.com")}」です</p>`],
    ["www.example.comです", `<p>${link("http://www.example.com", "www.example.com")}です</p>`],
  ];
  for (const [input, expected] of cases) assert.equal(html(input), expected, input);
});

test("URL: 漢字・カタカナでは切らない。2 つ並べても別々のリンク。切れたあとの文は太字などとして読み直す", () => {
  assert.equal(html("https://ja.wikipedia.org/wiki/東京都の"), `<p>${link("https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD", "https://ja.wikipedia.org/wiki/東京都")}の</p>`);
  assert.equal(html("https://ja.wikipedia.org/wiki/カタカナ"), `<p>${link("https://ja.wikipedia.org/wiki/%E3%82%AB%E3%82%BF%E3%82%AB%E3%83%8A", "https://ja.wikipedia.org/wiki/カタカナ")}</p>`);
  // 漢字の語の一部になる記号（々 〆 〇 〻）でも切らない
  assert.equal(html("https://example.com/人々"), `<p>${link("https://example.com/%E4%BA%BA%E3%80%85", "https://example.com/人々")}</p>`);
  assert.equal(html("https://example.com/〇〇"), `<p>${link("https://example.com/%E3%80%87%E3%80%87", "https://example.com/〇〇")}</p>`);
  assert.equal(html("https://a.com、https://b.com"), `<p>${link("https://a.com")}、${link("https://b.com")}</p>`);
  assert.equal(html("**詳細（https://example.com）**です"), `<p><strong>詳細（${link("https://example.com")}）</strong>です</p>`);
  // メールの形はいまも正しく切れる
  assert.equal(html("foo@example.comまで"), `<p>${link("mailto:foo@example.com", "foo@example.com")}まで</p>`);
});

test("URL: 止まる文字がなければ、元の自動リンクの部品と同じに読む（半角の記号の終わり・かっこの数・& の扱い）", () => {
  const samples = [
    "Visit www.commonmark.org/help for more information.",
    "Visit www.commonmark.org/a.b.",
    "www.google.com/search?q=Markup+(business)))",
    "www.google.com/search?q=(business))+ok",
    "www.google.com/search?q=commonmark&hl=en",
    "www.google.com/search?q=commonmark&hl;",
    "www.commonmark.org/he<lp",
    "https://example.com/(a)). と https://example.com/a!? と http://x.y/z_ と (https://a.b/c)",
    "see https://example.com, and www.x.org. https://a_b.example.com/x",
    "https://example.com/日本語/テスト?q=漢字 の前",
    "[リンク https://a.b](https://c.d) と ![x](https://e.f/g.png)",
    "foo@bar.baz と a.b-c_d@a.b. と mailto:x@y.z",
  ];
  for (const text of samples) {
    const expected = renderToStaticMarkup(renderMarkdown(original, text, {}));
    const actual = renderToStaticMarkup(renderMarkdown(stopping, text, {}));
    assert.equal(actual, expected, text);
  }
});

test("止まる文字の一覧: 漢字・カタカナ・半角は止めない", () => {
  for (const ch of "、。「」『』【】〈〉《》〔〕〜（）！？：；，．あんゝ…‥“”‘’") assert.ok(isUrlStop(ch.codePointAt(0)!), ch);
  for (const ch of "東京都カタカナー・々〆〇〻aZ09/-_.~!?()") assert.ok(!isUrlStop(ch.codePointAt(0)!), ch);
  assert.ok(!isUrlStop(null));
});
