import assert from "node:assert/strict";
import { test } from "vitest";
import { sanitizeSvgTree, stripCssUrls, type SvgElementLike } from "./sanitizeSvg";

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
  append(node: FakeElement | string) {
    if (typeof node !== "string") node.parent = this;
    this.nodes.push(node);
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

test("sanitizeSvgTree: click のリンク（a）は中身を残して外す", () => {
  const svg = el("svg", {}, el("g", {}, el("a", { "xlink:href": "https://evil.example/", target: "_top" }, el("rect", { class: "node" }), el("text", {}, "A"))));
  sanitizeSvgTree(svg);
  assert.equal(String(svg), '<svg><g><rect class="node"></rect><text>A</text></g></svg>');
});

test("sanitizeSvgTree: 外を指す href・xlink:href・src を消し、# は残す", () => {
  const svg = el(
    "svg",
    {},
    el("image", { href: "https://evil.example/x.png", width: "10" }),
    el("image", { "xlink:href": "//evil.example/x.png" }),
    el("use", { href: "#arrow" }),
    el("filter", {}, el("feImage", { href: "http://127.0.0.1:1/api/x" })),
    el("image", { src: "data:image/png;base64,AAAA" }),
  );
  sanitizeSvgTree(svg);
  assert.equal(String(svg), '<svg><image width="10"></image><image></image><use href="#arrow"></use><filter><feImage></feImage></filter><image></image></svg>');
});

test("sanitizeSvgTree: foreignObject・スクリプトと on… の属性、href を書き換えるアニメーションを消す", () => {
  const svg = el(
    "svg",
    { onload: "alert(1)" },
    el("foreignObject", {}, el("div", {}, "x")),
    el("script", {}, "alert(1)"),
    el("rect", { onclick: "alert(1)", OnMouseOver: "x", fill: "red" }),
    el("set", { attributeName: "href", to: "https://evil.example/" }),
    el("animate", { attributeName: "opacity", values: "0;1" }),
  );
  sanitizeSvgTree(svg);
  assert.equal(String(svg), '<svg><rect fill="red"></rect><animate attributeName="opacity" values="0;1"></animate></svg>');
});

test("sanitizeSvgTree: CSS（style の属性・<style>）の外を読む書き方を消し、# の url は残す", () => {
  const svg = el("svg", {}, el("style", {}, '@import "https://evil.example/a.css"; .a { marker-end: url(#arrowhead); background: url(https://evil.example/x.png); }'), el("rect", { style: "fill: url( 'https://evil.example/p' ); stroke: red" }));
  sanitizeSvgTree(svg);
  assert.equal(String(svg), '<svg><style> .a { marker-end: url(#arrowhead); background: none; }</style><rect style="fill: none; stroke: red"></rect></svg>');
});

test("stripCssUrls: image-set と、引用符付きの # は残す url", () => {
  assert.equal(stripCssUrls('background: image-set("https://evil.example/a.png" 1x); fill: url("#g")'), 'background: none; fill: url("#g")');
});
