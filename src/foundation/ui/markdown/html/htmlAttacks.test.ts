import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Element, Nodes, Root } from "hast";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { Markdown } from "@/foundation/ui/markdown/Markdown";
import { VFile } from "vfile";
import { markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { tokenizeHtml } from "./htmlTokens";
import { applyMarkdownHtml } from "./htmlVerify";

/*
 * Markdown の中の HTML の攻撃の例。描く前の木を歩いて、出てきた要素と属性が一覧（htmlAllowlist.ts を読まずに、ここに別に写したもの。
 * 一覧を誤って広げても、ここの写しと食い違って落ちるように）の中だけで、値が決まりどおりであることを確かめる。描いた HTML の文字も、念のため探す
 */

/** 通すタグ */
const SPEC_TAGS = new Set(
  (
    "br wbr hr b i u strong em s strike del ins sub sup small big mark center font code tt kbd samp var q cite dfn abbr time details summary ruby rt " +
    "p div span blockquote pre h1 h2 h3 h4 h5 h6 section article aside header footer nav main address ul ol li dl dt dd " +
    "table thead tbody tfoot tr th td caption colgroup col figure figcaption a img"
  ).split(" "),
);

/** 通す属性（木の上の名前 → 付けられるタグ。null はすべて） */
const SPEC_PROPS: Record<string, string[] | null> = {
  title: null,
  lang: null,
  id: null,
  href: ["a"],
  src: ["img"],
  alt: ["img"],
  width: ["img"],
  open: ["details"],
  start: ["ol"],
  reversed: ["ol"],
  type: ["ol"],
  value: ["li"],
  colSpan: ["td", "th"],
  scope: ["td", "th"],
  align: ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "tr"],
  span: ["col", "colgroup"],
  dateTime: ["time"],
};

/** Markdown が作るタグ（HTML でないもの） */
const MARKDOWN_TAGS = new Set("p a img strong em del code pre blockquote ul ol li table thead tbody tr th td h1 h2 h3 h4 h5 h6 hr br input section sup span div".split(" "));

const isInt = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** 属性の値が決まりどおりか */
function valueFits(prop: string, value: unknown): boolean {
  switch (prop) {
    case "title":
      return typeof value === "string" && Array.from(value).length <= 500 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
    case "lang":
      return typeof value === "string" && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value);
    case "id":
      return typeof value === "string" && /^user-html-[A-Za-z0-9\-_.:]+$/.test(value);
    case "href": {
      const target = linkTargetOf(value);
      return typeof value === "string" && target !== null && (target.kind === "fragment" ? value.startsWith("#") : target.url === value);
    }
    case "src":
      return typeof value === "string" && /^https?:\/\/[^\s]+$/.test(value) && new URL(value).href === value;
    case "width":
      return isInt(value, 1, 2000);
    case "open":
    case "reversed":
      return value === true;
    case "start":
    case "value":
      return isInt(value, -9999, 99999);
    case "type":
      return typeof value === "string" && ["1", "a", "A", "i", "I"].includes(value);
    case "colSpan":
    case "span":
      return isInt(value, 1, 20);
    case "scope":
      return typeof value === "string" && ["row", "col", "rowgroup", "colgroup"].includes(value);
    case "align":
      return typeof value === "string" && ["left", "center", "right", "justify"].includes(value);
    case "dateTime":
      return typeof value === "string" && value.length <= 100;
    default:
      return false;
  }
}

function elements(node: Nodes, out: Element[] = []): Element[] {
  if (node.type === "element") out.push(node);
  if ("children" in node) for (const child of node.children) elements(child, out);
  return out;
}

const pipeline = pipelineOf(undefined, null);
const tree = (text: string): Root => {
  const result = markdownToHast(pipeline, text);
  assert.ok(result, `書いたままの文字にならず木になる: ${JSON.stringify(text.slice(0, 80))}`);
  return result;
};

/** 木の要素と属性が一覧の中だけで、値が決まりどおりか */
function assertSafe(root: Root, input: string) {
  for (const el of elements(root)) {
    const where = `${JSON.stringify(input)} の <${el.tagName}>`;
    if (el.data?.kickoffHtml) {
      assert.ok(SPEC_TAGS.has(el.tagName), `${where} は一覧のタグ`);
      for (const [prop, value] of Object.entries(el.properties)) {
        if (prop === "className") {
          assert.deepEqual(value, ["md-html"], `${where} のクラスは Kickoff の印だけ`);
          continue;
        }
        const tags = SPEC_PROPS[prop];
        assert.ok(tags !== undefined && (tags === null || tags.includes(el.tagName)) && el.tagName !== "font", `${where} に ${prop} は付けない`);
        assert.ok(valueFits(prop, value), `${where} の ${prop}=${JSON.stringify(value)} は決まりの外`);
      }
    } else {
      assert.ok(MARKDOWN_TAGS.has(el.tagName), `${where} は Markdown のタグ`);
      for (const prop of Object.keys(el.properties)) assert.doesNotMatch(prop, /^(on|style$|data(?!Footnote)|srcDoc|formAction|tabIndex|hidden)/, `${where} の ${prop}`);
    }
  }
  const html = renderToStaticMarkup(createElement(Markdown, null, input));
  assert.doesNotMatch(html, /<(script|iframe|object|embed|style|link|meta|base|form|input|button|select|textarea|label|svg|math|video|audio|template|dialog|marquee|bdo|source|picture)[\s>/]/i, input);
  // 文字で出たもの（&lt;…）は < を含まないので、< で始まる所だけが本物のタグ
  assert.doesNotMatch(html, /<[a-z][^>]*\s(on[a-z]+|style|srcdoc|formaction|autofocus|tabindex|accesskey|contenteditable|hidden|popover|target|ping|download|srcset|background|for|name|data-[a-z-]+)[\s=>]/i, input);
  assert.doesNotMatch(html, /<[a-z][^>]*\s(href|src)="(?!https?:\/\/|#)/i, input);
}

/** 攻撃の例（どれも、一覧の外のタグ・属性・値が描かれないこと） */
const ATTACKS: string[] = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  '<img src="https://example.com/a.png" onerror="alert(1)" onload="alert(2)">',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  "<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>",
  '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="java&Tab;script:alert(1)">x</a>',
  '<a href="&#106;&#97;vascript:alert(1)">x</a>',
  '<a href="&#x6A;avascript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="//evil.example/x">x</a>',
  '<a href="https:/evil.example">x</a>',
  '<a href="/\\evil.example">x</a>',
  '<a href="https://example.com/\nx">x</a>',
  '<a href="https://example.com/\u0001x">x</a>',
  '<a href="mailto:a@example.com">x</a>',
  '<a href="/api/projects">x</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="https://evil.example/x.swf"></object><embed src="https://evil.example/x">',
  '<form action="https://evil.example"><input name=q autofocus onfocus=alert(1)><button formaction="javascript:alert(1)">送る</button></form>',
  '<div autofocus tabindex=0 onfocus="alert(1)">x</div>',
  '<details open ontoggle="alert(1)"><summary>s</summary>x</details>',
  '<p style="position:fixed;inset:0;background:red">x</p>',
  '<span class="file-link code-block-copy">x</span>',
  '<span data-file-path="src/a.ts" data-file-line="1" data-tip="x">a.ts</span>',
  '<label for="send">押す</label>',
  '<base href="https://evil.example/">',
  '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  '<link rel="stylesheet" href="https://evil.example/x.css">',
  "<style>body{display:none}</style>",
  "<template><img src=x onerror=alert(1)></template>",
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  "<textarea><img src=x onerror=alert(1)></textarea>",
  "<title><img src=x onerror=alert(1)></title>",
  "<xmp><img src=x onerror=alert(1)></xmp>",
  "<plaintext><img src=x onerror=alert(1)>",
  "<!--><img src=x onerror=alert(1)>-->",
  "<!-- --!><img src=x onerror=alert(1)> -->",
  "<![CDATA[<img src=https://example.com/a.png onerror=alert(1)>]]>",
  '<?xml version="1.0"?><img src=x onerror=alert(1)>',
  '<div id="root">x</div><span id="a b">y</span>',
  '<a name="x" href="https://example.com">x</a>',
  '<div ref="x" key="y" children="z" dangerouslysetinnerhtml="w" is="v">x</div>',
  '<div dangerouslySetInnerHTML="w">x</div>',
  '<table><tr><td background="https://evil.example/a.png">x</td></tr></table>',
  '<img src="https://example.com/a.png" srcset="https://evil.example/b.png 2x" height="9999" width="99999">',
  '<picture><source srcset="https://evil.example/a.png"><img src="https://example.com/a.png"></picture>',
  '<video src="https://evil.example/a.mp4" autoplay></video><audio src="https://evil.example/a.mp3"></audio>',
  "<marquee>x</marquee><bdo dir=rtl>abc</bdo>",
  "<div hidden>x</div><p contenteditable>y</p><span tabindex=1 accesskey=s>z</span>",
  '<a href="https://example.com" target="_blank" ping="https://evil.example" download>x</a>',
  "<dialog open>x</dialog><div popover>y</div>",
  "<select><option>x</option></select>",
  `<p title="${"あ".repeat(600)}\u0007">x</p>`,
  '<p lang="ja-JP" title="t">x</p><p lang="ja jp">y</p><p lang="javascript:1">z</p>',
  '<ol start="100000" type="x" reversed><li value="-10000">a</li></ol><ol start="-9999" type="I"><li value="99999">b</li></ol>',
  '<table><colgroup span="21"><col span="0"></colgroup><tr><th scope="xx" colspan="21">a</th></tr></table>',
  '<img src="https://example.com/a.png" align="left"><table align="right"><tr><td align="middle">x</td></tr></table>',
  '<time datetime="2026-11-26">今日</time><font color="red" size="7" face="x">f</font>',
];

test("攻撃の例: 出てきた要素と属性は一覧の中だけで、値は決まりどおり", () => {
  for (const input of ATTACKS) assertSafe(tree(input), input);
});

const htmlOf = (text: string) => renderToStaticMarkup(createElement(Markdown, null, text));

test("攻撃の例: 一覧の外のタグは書いたままの文字で出る", () => {
  assert.match(htmlOf("<script>alert(1)</script>"), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(htmlOf("<iframe srcdoc=x></iframe>"), /&lt;iframe srcdoc=x&gt;&lt;\/iframe&gt;/);
  assert.match(htmlOf("<template><b>x</b></template>"), /&lt;template&gt;<b class="md-html">x<\/b>&lt;\/template&gt;/);
  // CDATA・<?…?> は中身ごと文字（中のタグを読まない）
  assert.match(htmlOf("<![CDATA[<b>x</b>]]>"), /&lt;!\[CDATA\[&lt;b&gt;x&lt;\/b&gt;\]\]&gt;/);
  assert.match(htmlOf('<?xml version="1.0"?>'), /&lt;\?xml/);
  // 大文字を含むタグ・属性の名前、Promise<S> は文字のまま
  assert.match(htmlOf("<DIV>x</DIV> <Button>y</Button> <div CLASS=x>z</div>"), /&lt;DIV&gt;x&lt;\/DIV&gt; &lt;Button&gt;y&lt;\/Button&gt; &lt;div CLASS=x&gt;z&lt;\/div&gt;/);
  assert.match(htmlOf("Promise<S> と Map<K, V>"), /Promise&lt;S&gt; と Map&lt;K, V&gt;/);
});

test("攻撃の例: リンクは判定を通った行き先だけ（//host は https として読み、ほかはリンクにしない）", () => {
  const hrefs = (text: string) => elements(tree(text)).flatMap((el) => (el.tagName === "a" && el.properties.href !== undefined ? [el.properties.href] : []));
  assert.deepEqual(hrefs('<a href="//evil.example/x">x</a>'), ["https://evil.example/x"]);
  assert.deepEqual(hrefs('<a href="https:/evil.example">x</a>'), ["https://evil.example/"]);
  for (const input of ATTACKS.filter((a) => a.startsWith("<a href=") && !/\/\/evil|https:\/evil|https:\/\/example\.com"/.test(a))) assert.deepEqual(hrefs(input), [], input);
  // リンクにしないものは、文字だけを出す
  assert.equal(htmlOf('<a href="mailto:a@example.com">連絡</a>'), '<div class="markdown"><p>連絡</p></div>');
});

test("攻撃の例: 大きさ・入れ子・表の結合", () => {
  const tags = (text: string) => elements(tree(text)).map((el) => el.tagName);
  // small の 30 重は内側を外して 1 つ。h6 は div をはさんで重ねられない
  assert.deepEqual(tags(`${"<small>".repeat(30)}x${"</small>".repeat(30)}`), ["p", "small"]);
  assert.equal(tags("<h6><div><h6>x</h6></div></h6>").filter((t) => t === "h6").length, 1);
  assert.ok(!tags("<div><h6><div><h6>x</h6></div></h6></div>").some((t, i, all) => t === "h6" && all.indexOf("h6") !== i));
  // pre の中のタグは描かず文字だけ。rp は中身ごと消す
  assert.deepEqual(tags("<pre><details><summary>a</summary>b</details></pre>"), ["pre"]);
  assert.match(htmlOf("<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>"), /<ruby class="md-html">漢<rt class="md-html">かん<\/rt><\/ruby>/);
  // rowspan は通さず、colspan は 20 まで
  const cells = elements(tree("<table><tr><td rowspan=100 colspan=100>a</td><td colspan=3>b</td></tr></table>")).filter((el) => el.tagName === "td");
  assert.deepEqual(
    cells.map((c) => c.properties),
    [{ className: ["md-html"] }, { colSpan: 3, className: ["md-html"] }],
  );
});

test("攻撃の例: 閉じないタグは後ろを巻き込まず、節の数は入力に比例する", () => {
  // 閉じない a は、箇条書きの次の項目に効かない
  const list = tree('- <a href="https://example.com">x\n- y');
  assert.ok(!elements(list).some((el) => el.tagName === "a"));
  assert.match(htmlOf('- <a href="https://example.com">x\n- y'), /<li>&lt;a href=&quot;https:\/\/example.com&quot;&gt;x<\/li>\n<li>y<\/li>/);
  // 閉じない b・i・u を大量に並べ、段落を繰り返しても、節は膨らまない
  const count = (node: Nodes): number => 1 + ("children" in node ? node.children.reduce((n, c) => n + count(c), 0) : 0);
  for (const n of [100, 200, 400]) {
    const text = `${'<b title="n"><i><u>'.repeat(n)}\n${"<p>".repeat(n)}`;
    assert.ok(count(tree(text)) <= 5 * n + 10, `${n} 個`);
    const paragraphs = Array.from({ length: n }, () => "<b><i><u>段落").join("\n\n");
    assert.ok(count(tree(paragraphs)) <= 6 * n + 10, `${n} 段落`);
  }
});

test("攻撃の例: 上限（タグ 2,000 個・入れ子 32 段・字下げ 10 段）を超えたブロックは書いたままの文字", () => {
  assert.ok(markdownToHast(pipeline, "<b>x</b>".repeat(1000)));
  assert.equal(markdownToHast(pipeline, "<b>x</b>".repeat(1001)), null);
  assert.ok(markdownToHast(pipeline, `${"<div>".repeat(32)}x${"</div>".repeat(32)}`));
  assert.equal(markdownToHast(pipeline, `${"<div>".repeat(33)}x${"</div>".repeat(33)}`), null);
  assert.ok(markdownToHast(pipeline, `${"<blockquote>".repeat(10)}x${"</blockquote>".repeat(10)}`));
  assert.equal(markdownToHast(pipeline, `${"<blockquote>".repeat(11)}x${"</blockquote>".repeat(11)}`), null);
  // Markdown だけの深い入れ子も同じ
  assert.ok(markdownToHast(pipeline, `${"> ".repeat(10)}x`));
  assert.equal(markdownToHast(pipeline, `${"> ".repeat(11)}x`), null);
  // 描く部品は、書いたままの文字で出す
  assert.match(htmlOf(`${"<div>".repeat(33)}x${"</div>".repeat(33)}`), /<p class="markdown-plain">&lt;div&gt;/);
});

/** HTML の読み取りの段（Markdown の読み取りのあとの raw を要素にする所）だけの時間（ms） */
function htmlStepTime(text: string): number {
  const file = new VFile(text);
  const hast = pipeline.toHast.runSync(pipeline.toHast.parse(file), file);
  const start = performance.now();
  applyMarkdownHtml(hast);
  return performance.now() - start;
}

/** 読み取りを悪くする形（コメント・--!>・閉じない引用符・閉じないタグ・CDATA・<? の並び） */
const SLOW_UNITS = ["<!--", "<!-- --!> ", '<a href="', "<b a='<b a=' ", "<b>x", "<details>", "<![CDATA[", "<?", "<!X", "</b"];

test("攻撃の例: 悪い形の 100KB・300KB でも、HTML の読み取りは入力の長さに比例する時間で終わる", () => {
  for (const unit of SLOW_UNITS) {
    for (const size of [100_000, 300_000]) {
      const text = unit.repeat(Math.ceil(size / unit.length));
      const start = performance.now();
      tokenizeHtml(text);
      const tokenize = performance.now() - start;
      assert.ok(tokenize < 300, `${JSON.stringify(unit)} ${size} 字の読み取り: ${tokenize.toFixed(0)}ms`);
      const step = htmlStepTime(text);
      assert.ok(step < 300, `${JSON.stringify(unit)} ${size} 字の要素にする段: ${step.toFixed(0)}ms`);
    }
  }
});

test("攻撃の例: 書きかけの返答（20KB を 200 字ずつ伸ばす）でも、HTML の読み取りの合計は短い", () => {
  for (const unit of SLOW_UNITS) {
    const text = unit.repeat(Math.ceil(20_000 / unit.length));
    let total = 0;
    for (let length = 200; length <= text.length; length += 200) total += htmlStepTime(text.slice(0, length));
    assert.ok(total < 300, `${JSON.stringify(unit)}: ${total.toFixed(0)}ms`);
  }
});
