import assert from "node:assert/strict";
import { test } from "node:test";
import { convertTexDelimiters, isSingleDollarMath, looksLikeMath, mathRanges, mayContainMath } from "./mathGuard";

test("looksLikeMath: 1 文字の英字・英字を含む式・TeX の記号を含むものは数式", () => {
  for (const tex of ["x", "2x+1", "a-b", "n*(n+1)", "x^2", "a_1", "\\alpha", "\\frac{a}{b}", "a \\le b", "E = mc^2", "π r²", "x ≤ y"]) {
    assert.ok(looksLikeMath(tex), tex);
  }
});

test("looksLikeMath: 数だけ・文の言葉・前後の空白・長すぎるものは数式にしない", () => {
  for (const text of ["5", "3.14", "5-10", "HOME と ", " x", "5 から ", "price is high", "面積", "50%", "", "x".repeat(61)]) {
    assert.ok(!looksLikeMath(text), text);
  }
  // TeX の命令の名前（frac・alpha）や \text{} の中は、文の言葉と数えない
  assert.ok(looksLikeMath("\\text{面} = \\pi r^2"));
});

test("isSingleDollarMath: 値段・シェルの変数と取り違えない", () => {
  // 月 $5 から $20 に上げる → 「5 から 」は数式でない
  assert.ok(!isSingleDollarMath("5 から ", " ", "2"));
  // echo $HOME と $PATH → 「HOME と 」は数式でない
  assert.ok(!isSingleDollarMath("HOME と ", " ", "P"));
  // US$5 と $10 → 前が英字
  assert.ok(!isSingleDollarMath("5 と ", "S", "1"));
  // 閉じの後ろが英数字
  assert.ok(!isSingleDollarMath("x", " ", "y"));
  // 前がバックスラッシュ（\$ のエスケープの続き）
  assert.ok(!isSingleDollarMath("x", "\\", " "));
});

test("isSingleDollarMath: 文の中の数式は数式にする（日本語の文に続けて書いても）", () => {
  assert.ok(isSingleDollarMath("x^2", " ", " "));
  assert.ok(isSingleDollarMath("\\alpha", undefined, undefined));
  assert.ok(isSingleDollarMath("\\pi r^2", "は", "で"));
  assert.ok(isSingleDollarMath("x", "(", ")"));
});

test("convertTexDelimiters: \\( \\) は文の中の数式、行の頭の \\[ \\] は段落の数式に", () => {
  assert.equal(convertTexDelimiters("面積は \\(\\pi r^2\\) です"), "面積は $$\\pi r^2$$ です");
  assert.equal(convertTexDelimiters("式:\n\\[\n  E = mc^2\n\\]\n終わり"), "式:\n$$\nE = mc^2\n$$\n終わり");
  assert.equal(convertTexDelimiters("\\[a+b=c\\]"), "$$\na+b=c\n$$");
  // 数式らしくない \( \) はそのまま（正規表現の説明など）
  assert.equal(convertTexDelimiters("\\(hello world\\) を探す"), "\\(hello world\\) を探す");
  // 行の途中の \[ \] は、中身が数式らしいときだけ文の中の数式に
  assert.equal(convertTexDelimiters("和は \\[\\sum i\\] になる"), "和は $$\\sum i$$ になる");
  assert.equal(convertTexDelimiters("配列 a\\[0\\] の値"), "配列 a\\[0\\] の値");
});

test("convertTexDelimiters: コードの中は書き換えない", () => {
  const fenced = "```js\nconst r = /\\(x\\)/;\n```\n本文 \\(x^2\\)";
  assert.equal(convertTexDelimiters(fenced), "```js\nconst r = /\\(x\\)/;\n```\n本文 $$x^2$$");
  assert.equal(convertTexDelimiters("`\\(x^2\\)` と \\(y^2\\)"), "`\\(x^2\\)` と $$y^2$$");
  // 閉じていない囲みは終わりまでコード
  assert.equal(convertTexDelimiters("```\n\\(x^2\\)"), "```\n\\(x^2\\)");
});

test("mathRanges: Markdown の表示と同じ決まりで数式の場所を探す", () => {
  const text = "面積は $\\pi r^2$、月 $5 から $20。\n\n$$\nE = mc^2\n$$\n\n式 $$a+b$$ と \\(x^2\\) と \\[y_1\\] と `$y$`\n\\[\n\\sum i\n\\]\n\\$x$ は数式でない";
  const found = mathRanges(text).map((r) => ({ text: text.slice(r.from, r.to), tex: r.tex, display: r.display }));
  assert.deepEqual(found, [
    { text: "$\\pi r^2$", tex: "\\pi r^2", display: false },
    { text: "$$\nE = mc^2\n$$", tex: "E = mc^2", display: true },
    { text: "$$a+b$$", tex: "a+b", display: false },
    { text: "\\(x^2\\)", tex: "x^2", display: false },
    { text: "\\[y_1\\]", tex: "y_1", display: false },
    { text: "\\[\n\\sum i\n\\]", tex: "\\sum i", display: true },
  ]);
});

test("mayContainMath: 数式の書き方を含みうるか", () => {
  assert.ok(mayContainMath("$x$"));
  assert.ok(mayContainMath("\\(x\\)"));
  assert.ok(!mayContainMath("ふつうの文"));
});
