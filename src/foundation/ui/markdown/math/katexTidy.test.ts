import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "vitest";
import type { Element, ElementContent, Root } from "hast";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { createPipeline, markdownToHast } from "@/foundation/ui/markdown/markdownProcessor";
import { markdownRemarkPlugins } from "@/foundation/ui/markdown/syntax/markdownPlugins";
import { SEE_THROUGH_CLASS, TALL_MATH_CLASS, TIDY_KATEX_SCRIPT, tidyRenderedMath, type KatexElementLike } from "@shared/foundation/math/katexSettings";
import { rehypeSafeMath } from "./katexOptions";
import { mathPluginsOf } from "./mathPlugins";

/*
 * 描いた式の整えは 3 か所にある（返答の rehypeSafeMath・ノートの tidyRenderedMath・スマホのページの TIDY_KATEX_SCRIPT）。
 * KaTeX が描いた同じ木に 3 つを当てて、同じ結果になることを確かめる（DOM の 2 つは、hast をそのまま書き換える偽の DOM に当てる）
 */

/** DOM の属性の名前 → hast の properties の名前 */
const PROPERTY_NAMES: Record<string, string> = { "aria-hidden": "ariaHidden" };
const propertyOf = (name: string) => PROPERTY_NAMES[name] ?? name;
const classesOf = (node: Element): string[] => (Array.isArray(node.properties.className) ? node.properties.className.map(String) : []);

/** 整えが使う形の選び方（「a, b」・タグの名前・.クラス・[属性]）に当たるか */
function matches(node: Element, selector: string): boolean {
  return selector.split(",").some((part) => {
    const s = part.trim();
    if (s.startsWith(".")) return classesOf(node).includes(s.slice(1));
    if (s.startsWith("[")) return node.properties[propertyOf(s.slice(1, -1))] != null;
    return node.tagName === s;
  });
}

/** hast の要素を、整えに使う DOM の口で包んだもの（書き換えは hast に入る） */
class HastElement implements KatexElementLike {
  constructor(
    readonly node: Element,
    readonly parent: HastElement | null,
  ) {}
  get localName() {
    return this.node.tagName;
  }
  get classList() {
    return {
      add: (name: string) => {
        if (!classesOf(this.node).includes(name)) this.node.properties.className = [...classesOf(this.node), name];
      },
    };
  }
  getAttribute(name: string) {
    const value = this.node.properties[propertyOf(name)];
    return value == null ? null : String(value);
  }
  setAttribute(name: string, value: string) {
    this.node.properties[propertyOf(name)] = value;
  }
  replaceChildren() {
    this.node.children = [];
  }
  closest(selector: string) {
    for (let at: HastElement | null = this; at; at = at.parent) if (matches(at.node, selector)) return at;
    return null;
  }
  querySelectorAll(selector: string): HastElement[] {
    const found: HastElement[] = [];
    const walk = (parent: HastElement) => {
      for (const child of parent.node.children) {
        if (child.type !== "element") continue;
        const el = new HastElement(child, parent);
        if (matches(child, selector)) found.push(el);
        walk(el);
      }
    };
    walk(this);
    return found;
  }
}

/** 木の根を包む（根は要素でないので、同じ子を持つ仮の要素にする） */
const domOf = (tree: Root) => new HastElement({ type: "element", tagName: "div", properties: {}, children: tree.children as ElementContent[] }, null);

const pageTidy = vm.runInNewContext(`${TIDY_KATEX_SCRIPT}\nkickoffTidyKatex`) as (root: unknown) => void;
const TIDIES: [string, (tree: Root) => void][] = [
  ["rehypeSafeMath", (tree) => rehypeSafeMath()(tree)],
  ["tidyRenderedMath", (tree) => tidyRenderedMath(domOf(tree))],
  ["TIDY_KATEX_SCRIPT", (tree) => pageTidy(domOf(tree))],
];

/** 返答と同じ組から、最後の整え（rehypeSafeMath）だけを外した組で KaTeX が描いた木（整える前） */
const math = mathPluginsOf(remarkMath, rehypeKatex);
assert.equal(math.rehype.at(-1), rehypeSafeMath);
const katexOnly = createPipeline(markdownRemarkPlugins(math.remark), math.rehype.slice(0, -1));
const rendered = (markdown: string): Root => {
  const tree = markdownToHast(katexOnly, markdown);
  assert.ok(tree, markdown);
  return tree;
};

/** KaTeX が描かない形（透明度のある色・透明な mathcolor）も確かめる手書きの木 */
const el = (tagName: string, properties: Element["properties"], ...children: ElementContent[]): Element => ({ type: "element", tagName, properties, children });
const text = (value: string): ElementContent => ({ type: "text", value });
const handmade = (): Root => ({
  type: "root",
  children: [
    el(
      "span",
      { className: ["katex"] },
      el("span", { style: "margin-right:1em;color:#ff000080;" }, text("a")),
      el("span", { style: "color:red;" }, text("b")),
      el("mstyle", { mathcolor: "#0000" }, text("c")),
      el("mstyle", { mathcolor: "red" }, text("d")),
    ),
  ],
});

/** 3 つの整えを同じ木の写しに当てた結果（同じであることを確かめてから返す） */
function tidied(source: () => Root, label: string): Root {
  const results = TIDIES.map(([, tidy]) => {
    const tree = structuredClone(source());
    tidy(tree);
    return tree;
  });
  for (let i = 1; i < results.length; i++) assert.deepEqual(results[i], results[0], `${label}: ${TIDIES[i][0]}`);
  return results[0];
}

/** 木の中の要素で、当たるものの数 */
function count(tree: Root, hit: (node: Element) => boolean): number {
  let n = 0;
  const walk = (children: Root["children"] | ElementContent[]) => {
    for (const child of children) {
      if (child.type !== "element") continue;
      if (hit(child)) n++;
      walk(child.children);
    }
  };
  walk(tree.children);
  return n;
}
const seeThrough = (node: Element) => classesOf(node).includes(SEE_THROUGH_CLASS) && node.properties.ariaHidden === "true";
const tall = (node: Element) => classesOf(node).includes(TALL_MATH_CLASS);
const emptyPhantom = (node: Element) => node.tagName === "mphantom" && node.children.length === 0;

test("描いた式の整え: 返答・ノート・スマホのページの 3 つが、KaTeX の同じ木に同じ整えをする（見えない文字・MathML の見えない部分・高すぎる行の中の式）", () => {
  // 文の中の式は $$…$$ で書く（1 つの $ は英単語・記号だけの式を数式と読まない）。段落の式は $$ を別の行に書く
  const inline = (tex: string) => rendered(["式 $$", tex, "$$"].join(""));
  const display = (tex: string) => rendered(["$$", tex, "$$"].join("\n"));
  const phantom = tidied(() => inline(String.raw`a\phantom{secret}b`), "phantom");
  assert.ok(count(phantom, seeThrough) > 0 && count(phantom, emptyPhantom) > 0);
  const displayPhantom = tidied(() => display(String.raw`\phantom{\text{secret}}`), "段落の phantom");
  assert.ok(count(displayPhantom, seeThrough) > 0);
  // 行の中の高すぎる式だけに印を付ける（段落の式・8 行の行列には付けない）
  const stretched = String.raw`\def\arraystretch{50}\begin{matrix}a\\b\end{matrix}`;
  assert.equal(count(tidied(() => inline(stretched), "行の中の高い式"), tall), 1);
  assert.equal(count(tidied(() => display(stretched), "段落の高い式"), tall), 0);
  assert.equal(count(tidied(() => inline(String.raw`\begin{matrix}1\\2\\3\\4\\5\\6\\7\\8\end{matrix}`), "8 行の行列"), tall), 0);
  const plain = tidied(() => rendered("$x^2$ と $\\frac{a}{b}$"), "ふつうの式");
  assert.equal(count(plain, (node) => seeThrough(node) || tall(node)), 0);
});

test("描いた式の整え: 透明度のある文字色・透明な mathcolor も 3 つで同じに整え、ふつうの色は変えない", () => {
  const tree = tidied(handmade, "手書きの木");
  const [katexEl] = tree.children as Element[];
  const [alpha, red, clear, redMathml] = katexEl.children as Element[];
  assert.equal(seeThrough(alpha), true);
  assert.equal(seeThrough(red), false);
  assert.deepEqual([clear.children.length, redMathml.children.length], [0, 1]);
});
