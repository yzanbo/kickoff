import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { pipelineOf, renderMarkdown } from "@/foundation/ui/markdown/markdownProcessor";

/*
 * 読み方の設定の組（markdownPlugins.ts）で描いた HTML を、例文ごとに確かめる。
 * 例文は日本語の返答で崩れていた書き方と、崩れていなかった書き方・英語の文（読み方を変えないもの）
 */

const html = (text: string) => renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), text, {}));

function check(cases: [string, string][]) {
  for (const [input, expected] of cases) assert.equal(html(input), expected, JSON.stringify(input));
}

test("強調・取り消し線: 印の内側が記号で外側が日本語でも、開き・閉じとして読む", () => {
  check([
    ["**スポークスマン（spokesman）**は", "<p><strong>スポークスマン（spokesman）</strong>は</p>"],
    ["**「強調」**は", "<p><strong>「強調」</strong>は</p>"],
    ["**【済】**です", "<p><strong>【済】</strong>です</p>"],
    ["**強調。**次", "<p><strong>強調。</strong>次</p>"],
    ["**太字：**説明", "<p><strong>太字：</strong>説明</p>"],
    ["**100%**の", "<p><strong>100%</strong>の</p>"],
    ["**`code`**です", "<p><strong><code>code</code></strong>です</p>"],
    ["**[リンク](https://a.example)**です", '<p><strong><a href="https://a.example">リンク</a></strong>です</p>'],
    ["*斜体（x）*です", "<p><em>斜体（x）</em>です</p>"],
    ["~~取消（x）~~です", "<p><del>取消（x）</del>です</p>"],
    ["***強調（x）***は", "<p><em><strong>強調（x）</strong></em>は</p>"],
    ["**ノート（.md）**と**チャット（.json）**の違い", "<p><strong>ノート（.md）</strong>と<strong>チャット（.json）</strong>の違い</p>"],
    // 箇条書き・表・見出しの中も同じ
    ["- **「項目」**は", "<ul>\n<li><strong>「項目」</strong>は</li>\n</ul>"],
    ["# **【見出し】**です", "<h1><strong>【見出し】</strong>です</h1>"],
    ["| a |\n|---|\n| **「セル」**は |", '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td><strong>「セル」</strong>は</td></tr></tbody></table>'],
  ]);
});

test("取り消し線は ~~ だけ: ~ 1 つは文字のまま（範囲の 5~10秒 に線を引かない）", () => {
  check([
    ["所要時間は5~10秒、長くて20~30秒です", "<p>所要時間は5~10秒、長くて20~30秒です</p>"],
    ["~1 つ~ は文字", "<p>~1 つ~ は文字</p>"],
    ["~~消した~~ と ~~~3 つ~~~", "<p><del>消した</del> と ~~~3 つ~~~</p>"],
  ]);
});

test("強調: 崩れていなかった書き方・英語の文・_ の印は、これまでと同じに読む", () => {
  check([
    ["**強調**は", "<p><strong>強調</strong>は</p>"],
    ["「**強調**」は", "<p>「<strong>強調</strong>」は</p>"],
    ["（**注意**）の", "<p>（<strong>注意</strong>）の</p>"],
    ["**太字（x）** の", "<p><strong>太字（x）</strong> の</p>"],
    ["`src/foo.ts`を直した", "<p><code>src/foo.ts</code>を直した</p>"],
    ["~/foo", "<p>~/foo</p>"],
    ["foo**bar**baz", "<p>foo<strong>bar</strong>baz</p>"],
    ["snake_case_name", "<p>snake_case_name</p>"],
    ["__init__", "<p><strong>init</strong></p>"],
    ["x * y * z", "<p>x * y * z</p>"],
    ["a **b** c", "<p>a <strong>b</strong> c</p>"],
    // 語の中の _ は強調にしない決まりを守る（直さない）
    ["__下線（x）__です", "<p>__下線（x）__です</p>"],
  ]);
});
