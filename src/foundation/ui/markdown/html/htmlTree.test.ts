import assert from "node:assert/strict";
import { test } from "vitest";
import { toHtml } from "hast-util-to-html";
import { createPipeline, markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { markdownRemarkPlugins } from "@/foundation/ui/markdown/syntax/markdownPlugins";
import { fakeFileLinks } from "@/foundation/ui/markdown/testing";
import { decodeCharacterReferences, tokenizeHtml } from "./htmlTokens";

const pipeline = pipelineOf(undefined, null);
/** 描く前の木を HTML の文字にしたもの（md-html のクラスは省いて見やすくする） */
const html = (text: string) => toHtml(markdownToHast(pipeline, text) ?? { type: "root", children: [] }).replace(/ class="md-html"/g, "");

test("ふつうの例: 文の中のタグ・表のマスの改行・ふりがな・略語", () => {
  assert.equal(html("<kbd>⌘</kbd>+<kbd>K</kbd> と H<sub>2</sub>O と x<sup>2</sup> と <mark>印</mark> と <u>下線</u>"), "<p><kbd>⌘</kbd>+<kbd>K</kbd> と H<sub>2</sub>O と x<sup>2</sup> と <mark>印</mark> と <u>下線</u></p>");
  assert.equal(html("| a |\n|---|\n| 一<br>二 |"), "<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>一<br>二</td>\n</tr>\n</tbody>\n</table>");
  assert.equal(html('<abbr title="HyperText Markup Language">HTML</abbr>'), '<p><abbr title="HyperText Markup Language">HTML</abbr></p>');
  assert.equal(html("<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>"), "<p><ruby>漢字<rt>かんじ</rt></ruby></p>");
});

test("ふつうの例: 入れ物の中の Markdown・寄せ方・画像・リンク・番号・結合", () => {
  assert.equal(html('<div align="center">\n\n**中**\n\n</div>'), '<div align="center">\n<p><strong>中</strong></p>\n</div>');
  assert.equal(html('<img src="https://example.com/a.png" width="200" alt="図">'), '<img src="https://example.com/a.png" width="200" alt="図">');
  assert.equal(html('<a href="https://example.com/x" title="説明">リンク</a>'), '<p><a href="https://example.com/x" title="説明">リンク</a></p>');
  assert.equal(html('<ol start="3" type="a"><li>c</li><li value="9">i</li></ol>'), '<ol start="3" type="a"><li>c</li><li value="9">i</li></ol>');
  assert.equal(html("<table><tr><th colspan=\"2\">見出し</th></tr><tr><td>a<td>b</table>"), '<table><tr><th colspan="2">見出し</th></tr><tr><td>a</td><td>b</td></tr></table>');
  assert.equal(html("<ul><li>a<li>b</ul>"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(html('<p id="top" lang="en">x</p>'), '<p id="user-html-top" lang="en">x</p>');
});

test("pre と code の中のタグは描かず、文字だけにする（文字参照は戻す）", () => {
  assert.equal(html("<pre><code>a <b>x</b> &lt;\n</code></pre>"), "<pre><code>a &#x3C;b>x&#x3C;/b> &#x3C;\n</code></pre>");
  assert.equal(html("文 <code><i>x</i></code>"), "<p>文 <code>&#x3C;i>x&#x3C;/i></code></p>");
});

test("そろわない開き・閉じは文字のまま。段落をまたがない", () => {
  assert.equal(html("<b>開きだけ と </i>閉じだけ"), "<p>&#x3C;b>開きだけ と &#x3C;/i>閉じだけ</p>");
  assert.equal(html("<b><i>x</b></i>"), "<p><b>&#x3C;i>x</b>&#x3C;/i></p>");
  assert.equal(html("<b>\n\n段落\n\n</b>"), "&#x3C;b>\n<p>段落</p>\n&#x3C;/b>");
  assert.equal(html("<p>a<div>b</div></p>"), "<p>a&#x3C;div>b&#x3C;/div></p>");
  // 表の部品・項目は決まった入れ物の中だけ。入れ物が閉じなければ中も文字
  assert.equal(html("<tr><td>x</td></tr>"), "&#x3C;tr>&#x3C;td>x&#x3C;/td>&#x3C;/tr>");
  assert.equal(html("<ul><li>a<li>b"), "&#x3C;ul>&#x3C;li>a&#x3C;li>b");
  assert.equal(html("<ul>x<li>a</li></ul>"), "&#x3C;ul>x&#x3C;li>a&#x3C;/li>&#x3C;/ul>");
  // 自分で閉じる形は、閉じの要らないタグだけ
  assert.equal(html("a<br/>b<br />c <b/>"), "<p>a<br>b<br>c &#x3C;b/></p>");
});

test("リンクの中のリンクは外し、Markdown の数式・チェックリスト・脚注・コードは Markdown の要素のまま", () => {
  assert.equal(html('<a href="https://a.example">x [y](https://b.example) z</a>'), '<p><a href="https://a.example/">x y z</a></p>');
  assert.equal(html("- [x] 済み\n\n```ts\n<b>x</b>\n```"), '<ul class="contains-task-list">\n<li class="task-list-item"><input type="checkbox" checked disabled> 済み</li>\n</ul>\n<pre><code class="language-ts">&#x3C;b>x&#x3C;/b>\n</code></pre>');
  assert.match(html("本文[^1]\n\n[^1]: <b>注</b>"), /<li id="user-content-fn-1">\n<p><b>注<\/b> <a href="#user-content-fnref-1"/);
});

test("読み取り: 小文字の一覧のタグだけをタグにし、属性の値の文字参照を戻す", () => {
  assert.deepEqual(
    tokenizeHtml('<a href="&amp;x" title=t>').map((t) => t.type === "start" && t.attrs),
    [
      [
        ["href", "&x"],
        ["title", "t"],
      ],
    ],
  );
  assert.deepEqual(
    tokenizeHtml("<A>x<foo>").map((t) => t.type),
    ["text"],
  );
  assert.equal(decodeCharacterReferences("&amp;&#106;&#x6A;&#0;&nosuch;&copy;"), "&jj�&nosuch;©");
});

test("ファイルのチップの印は Markdown の節にだけ付き、HTML に書いた data-file-path は描かない", () => {
  const withLinks = createPipeline(markdownRemarkPlugins([[fakeFileLinks, "a.ts"]]), []);
  const out = (text: string) => toHtml(markdownToHast(withLinks, text) ?? { type: "root", children: [] }).replace(/ class="md-html"/g, "");
  assert.equal(out("<div>\n\n`a.ts` を見る\n\n</div>"), '<div>\n<p><a href="#" data-file-path="a.ts">a.ts</a> を見る</p>\n</div>');
  assert.equal(out('<span data-file-path="a.ts" data-file-line="3">a.ts</span>'), "<p><span>a.ts</span></p>");
});

test("HTML に書いた id は脚注の id と別の頭（user-html-）にし、HTML の # のリンクはその頭の行き先を指す", () => {
  const out = html('本文[^1]\n\n<span id="fn-1">偽</span> <span id="user-content-fn-1">偽</span> <a href="#fn-1">飛ぶ</a>\n\n[^1]: 注');
  assert.match(out, /<span id="user-html-fn-1">偽<\/span> <span id="user-html-user-content-fn-1">偽<\/span> <a href="#user-html-fn-1">飛ぶ<\/a>/);
  // 脚注の番号の行き先は脚注のまま（同じ id は 1 つだけ）
  assert.match(out, /<a href="#user-content-fn-1" id="user-content-fnref-1"/);
  assert.equal(out.match(/id="user-content-fn-1"/g)?.length, 1);
});
