import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "vitest";
import { INLINE_MATH_MAX_EM, KATEX_SETTINGS, KATEX_TEXT_MACROS, KATEX_VERSION, katexBoxEm, SEE_THROUGH_CLASS, TALL_MATH_CLASS, TIDY_KATEX_SCRIPT } from "./katexSettings";

test("KATEX_VERSION: パソコンが読む katex の版と同じ（スマホは CDN からこの版を読む）", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../../node_modules/katex/package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(pkg.version, KATEX_VERSION);
});

test("KATEX_SETTINGS・KATEX_TEXT_MACROS: JSON にしても同じ（スマホのページに文字で入れる）", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(KATEX_SETTINGS)), KATEX_SETTINGS);
  assert.deepEqual(JSON.parse(JSON.stringify(KATEX_TEXT_MACROS)), KATEX_TEXT_MACROS);
  assert.equal(KATEX_SETTINGS.trust, false);
  assert.ok("\\color" in KATEX_TEXT_MACROS && "\\tiny" in KATEX_TEXT_MACROS && "\\scriptscriptstyle" in KATEX_TEXT_MACROS);
});

/** 偽の要素（整えに使う口だけ） */
class FakeElement {
  classes = new Set<string>();
  attrs: Map<string, string>;
  emptied = false;
  constructor(
    readonly localName: string,
    attrs: Record<string, string>,
  ) {
    this.attrs = new Map(Object.entries(attrs));
  }
  get classList() {
    return { add: (name: string) => void this.classes.add(name) };
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  replaceChildren() {
    this.emptied = true;
  }
}

test("TIDY_KATEX_SCRIPT（スマホのページ）: 透明な文字に選べないクラスと aria-hidden を付け、MathML の見えない部分を空にする", () => {
  const styled = [new FakeElement("span", { style: "color:transparent;" }), new FakeElement("span", { style: "margin-right:1em;color:#ff000080;" }), new FakeElement("span", { style: "color:red;" })];
  const mathml = [new FakeElement("mphantom", {}), new FakeElement("mstyle", { mathcolor: "#0000" }), new FakeElement("mstyle", { mathcolor: "red" })];
  const root = { querySelectorAll: (selector: string) => (selector === "[style]" ? styled : selector === "mphantom, [mathcolor]" ? mathml : []) };
  const tidy = vm.runInNewContext(`${TIDY_KATEX_SCRIPT}\nkickoffTidyKatex`) as (root: unknown) => void;
  tidy(root);
  assert.deepEqual(
    styled.map((el) => [el.classes.has(SEE_THROUGH_CLASS), el.getAttribute("aria-hidden")]),
    [
      [true, "true"],
      [true, "true"],
      [false, null],
    ],
  );
  assert.deepEqual(
    mathml.map((el) => el.emptied),
    [true, true, false],
  );
});

test("katexBoxEm: 支柱の高さと深さから式の箱の縦の大きさ（行が分かれた式は上と下の最大）", () => {
  assert.equal(katexBoxEm(["height:1.0404em;vertical-align:-0.345em;"]), 1.0404);
  assert.equal(katexBoxEm(["height:0.4306em;"]), 0.4306);
  assert.equal(katexBoxEm(["height:120em;vertical-align:-59.75em;"]), 120);
  assert.equal(katexBoxEm(["height:2em;vertical-align:-1em;", "height:3em;"]), 4);
  assert.equal(katexBoxEm([]), 0);
});

test("TIDY_KATEX_SCRIPT（スマホのページ）: 行の中の式の箱が上限より高ければ印を付け、段落の式・ふつうの式には付けない", () => {
  const strut = (style: string) => ({ getAttribute: () => style });
  const formula = (styles: string[], inDisplay: boolean) => {
    const classes = new Set<string>();
    return {
      classes,
      classList: { add: (name: string) => void classes.add(name) },
      closest: () => (inDisplay ? {} : null),
      querySelectorAll: () => styles.map(strut),
    };
  };
  const tall = formula(["height:120em;vertical-align:-59.75em;"], false);
  const display = formula(["height:120em;vertical-align:-59.75em;"], true);
  const matrix = formula(["height:9.6em;vertical-align:-4.55em;"], false);
  const root = { querySelectorAll: (selector: string) => (selector === ".katex" ? [tall, display, matrix] : []) };
  const tidy = vm.runInNewContext(`${TIDY_KATEX_SCRIPT}\nkickoffTidyKatex`) as (root: unknown) => void;
  tidy(root);
  assert.deepEqual(
    [tall, display, matrix].map((f) => f.classes.has(TALL_MATH_CLASS)),
    [true, false, false],
  );
  assert.ok(katexBoxEm(["height:120em;vertical-align:-59.75em;"]) > INLINE_MATH_MAX_EM && katexBoxEm(["height:9.6em;vertical-align:-4.55em;"]) <= INLINE_MATH_MAX_EM);
});
