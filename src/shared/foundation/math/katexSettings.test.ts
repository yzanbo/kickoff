import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "vitest";
import { KATEX_SETTINGS, KATEX_TEXT_MACROS, KATEX_VERSION, SEE_THROUGH_CLASS, TIDY_KATEX_SCRIPT } from "./katexSettings";

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
  const root = { querySelectorAll: (selector: string) => (selector === "[style]" ? styled : mathml) };
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
