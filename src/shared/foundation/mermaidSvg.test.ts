import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "vitest";
import { SANITIZE_SVG_SCRIPT, sanitizeSvgTree, stripCssUrls, type SvgElementLike } from "./mermaidSvg";

/** 偽の要素（整えに使う口だけ。テストに DOM がないため） */
class FakeElement implements SvgElementLike {
  parent: FakeElement | null = null;
  attrs = new Map<string, string>();
  nodes: (FakeElement | string)[] = [];
  constructor(
    readonly localName: string,
    attrs: Record<string, string> = {},
    nodes: (FakeElement | string)[] = [],
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    for (const n of nodes) this.append(n);
  }
  append(...nodes: (FakeElement | string)[]) {
    for (const node of nodes) {
      if (typeof node !== "string") node.parent = this;
      this.nodes.push(node);
    }
  }
  get attributes() {
    return [...this.attrs].map(([name, value]) => ({ name, value }));
  }
  get children() {
    return this.nodes.filter((n): n is FakeElement => typeof n !== "string");
  }
  get childNodes() {
    return this.nodes;
  }
  get textContent() {
    return this.nodes.map((n) => (typeof n === "string" ? n : n.textContent)).join("");
  }
  set textContent(value: string | null) {
    this.nodes = [value ?? ""];
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  remove() {
    if (this.parent) this.parent.nodes = this.parent.nodes.filter((n) => n !== this);
  }
  replaceWith(...nodes: never[]) {
    const parent = this.parent;
    if (!parent) return;
    const i = parent.nodes.indexOf(this);
    for (const n of nodes as (FakeElement | string)[]) if (typeof n !== "string") n.parent = parent;
    parent.nodes.splice(i, 1, ...(nodes as (FakeElement | string)[]));
  }
  /** 木を文字にする（比べるため） */
  toString(): string {
    const attrs = [...this.attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
    return `<${this.localName}${attrs}>${this.nodes.map(String).join("")}</${this.localName}>`;
  }
}

const el = (tag: string, attrs: Record<string, string> = {}, ...nodes: (FakeElement | string)[]) => new FakeElement(tag, attrs, nodes);
const group = () => new FakeElement("g");
/** 整える関数（TS のものと、スマホの WebView のページに入れるスクリプトのもの。同じ例で同じ結果になる） */
type SanitizeTree = (root: SvgElementLike, makeGroup: () => SvgElementLike) => void;
const pageSanitize = vm.runInNewContext(`${SANITIZE_SVG_SCRIPT}\nmermaidSanitizeSvgTree`) as SanitizeTree;
const IMPLS: [string, SanitizeTree][] = [
  ["TS", sanitizeSvgTree],
  ["ページのスクリプト", pageSanitize],
];

test.each(IMPLS)("sanitizeSvgTree（%s）: click のリンク（a）は外し、中身を位置と見た目だけを写した g に入れ直す", (_where, sanitizeTree) => {
  const sanitize = (svg: FakeElement) => sanitizeTree(svg, group);
  const svg = el(
    "svg",
    {},
    el("g", {}, el("a", { "xlink:href": "https://evil.example/", target: "_top", transform: "translate(102, 35.25)", class: "clickable", rel: "opener" }, el("rect", { class: "node" }), el("text", {}, "A"))),
  );
  sanitize(svg);
  assert.equal(String(svg), '<svg><g><g transform="translate(102, 35.25)" class="clickable"><rect class="node"></rect><text>A</text></g></g></svg>');
});

test.each(IMPLS)("sanitizeSvgTree（%s）: 外を指す href・xlink:href・src を消し、# は残す", (_where, sanitizeTree) => {
  const sanitize = (svg: FakeElement) => sanitizeTree(svg, group);
  const svg = el(
    "svg",
    {},
    el("image", { href: "https://evil.example/x.png", width: "10" }),
    el("image", { "xlink:href": "//evil.example/x.png" }),
    el("use", { href: "#arrow" }),
    el("filter", {}, el("feImage", { href: "http://127.0.0.1:1/api/x" })),
    el("image", { src: "data:image/png;base64,AAAA" }),
  );
  sanitize(svg);
  assert.equal(String(svg), '<svg><image width="10"></image><image></image><use href="#arrow"></use><filter><feImage></feImage></filter><image></image></svg>');
});

test.each(IMPLS)("sanitizeSvgTree（%s）: foreignObject・スクリプトと on… の属性、href を書き換えるアニメーションを消す", (_where, sanitizeTree) => {
  const sanitize = (svg: FakeElement) => sanitizeTree(svg, group);
  const svg = el(
    "svg",
    { onload: "alert(1)" },
    el("foreignObject", {}, el("div", {}, "x")),
    el("script", {}, "alert(1)"),
    el("rect", { onclick: "alert(1)", OnMouseOver: "x", fill: "red" }),
    el("set", { attributeName: "href", to: "https://evil.example/" }),
    el("animate", { attributeName: "opacity", values: "0;1" }),
  );
  sanitize(svg);
  assert.equal(String(svg), '<svg><rect fill="red"></rect><animate attributeName="opacity" values="0;1"></animate></svg>');
});

test.each(IMPLS)("sanitizeSvgTree（%s）: CSS（style の属性・<style>）の外を読む書き方を消し、# の url は残す", (_where, sanitizeTree) => {
  const sanitize = (svg: FakeElement) => sanitizeTree(svg, group);
  const svg = el("svg", {}, el("style", {}, '@import "https://evil.example/a.css"; .a { marker-end: url(#arrowhead); background: url(https://evil.example/x.png); }'), el("rect", { style: "fill: url( 'https://evil.example/p' ); stroke: red" }));
  sanitize(svg);
  assert.equal(String(svg), '<svg><style> .a { marker-end: url(#arrowhead); background: none; }</style><rect style="fill: none; stroke: red"></rect></svg>');
});

test("stripCssUrls: image-set と、引用符付きの # は残す url", () => {
  assert.equal(stripCssUrls('background: image-set("https://evil.example/a.png" 1x); fill: url("#g")'), 'background: none; fill: url("#g")');
});

test("stripCssUrls: エスケープ・コメントで隠した url・@import・image-set・@font-face も消す", () => {
  assert.equal(stripCssUrls(".a{background:\\75 rl(https://evil.example/a.png)}"), ".a{background:none}");
  assert.equal(stripCssUrls(".a{background:u/**/rl(https://evil.example/a.png)}"), ".a{background:none}");
  assert.equal(stripCssUrls('\\40 import "https://evil.example/a.css"; .a{fill:red}'), " .a{fill:red}");
  assert.equal(stripCssUrls('.a{background:\\69 mage-set("https://evil.example/a.png" 1x)}'), ".a{background:none}");
  assert.equal(stripCssUrls("@font-face{font-family:x;src:url(https://evil.example/f.woff)} .a{fill:red}"), " .a{fill:red}");
  assert.equal(stripCssUrls('fill: url("#g")'), 'fill: url("#g")');
});

test("SANITIZE_SVG_SCRIPT: ページの中の CSS の整えも、エスケープ・コメントで隠した url・@import を消す", () => {
  const svg = el("svg", {}, el("style", {}, ".a{background:\\75 rl(https://evil.example/a.png)} \\40 import 'https://evil.example/a.css';"), el("rect", { style: "fill:u/**/rl(https://evil.example/p)" }));
  pageSanitize(svg, group);
  assert.equal(String(svg), '<svg><style>.a{background:none} </style><rect style="fill:none"></rect></svg>');
});
