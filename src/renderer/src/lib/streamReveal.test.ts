import assert from "node:assert/strict";
import { test } from "node:test";
import type { Element, Root } from "hast";
import { nextRevealLength, revealBands, wrapStreamTail, REVEAL_FADE_MS } from "./streamReveal";

test("nextRevealLength: 遅れが大きいほど 1 フレームで多く出し、target を超えない", () => {
  const text = "a".repeat(1000);
  const small = nextRevealLength(text, 990, 16) - 990;
  const large = nextRevealLength(text, 0, 16);
  assert.ok(small >= 1);
  assert.ok(large > small * 5);
  assert.equal(nextRevealLength(text, 999, 1000), 1000);
  assert.equal(nextRevealLength(text, 1000, 16), 1000);
});

test("nextRevealLength: サロゲートペアの途中では切らない", () => {
  const text = `a${"😀".repeat(50)}`;
  for (let shown = 0; shown < text.length; ) {
    shown = nextRevealLength(text, shown, 16);
    const code = text.charCodeAt(shown - 1);
    assert.ok(shown === text.length || !(code >= 0xd800 && code <= 0xdbff), `shown=${shown}`);
  }
});

test("revealBands: 出てからの時間で段に分ける（新しい順）", () => {
  const step = REVEAL_FADE_MS / 3;
  const marks = [
    { at: 0, length: 10 },
    { at: 1000 - step * 2.5, length: 20 },
    { at: 1000 - step * 1.5, length: 30 },
    { at: 1000 - step * 0.5, length: 45 },
  ];
  assert.deepEqual(revealBands(marks, 1000), [15, 10, 10]);
  // 長く止まっていれば、どの段も 0
  assert.deepEqual(revealBands([{ at: 0, length: 45 }], 5000), [0, 0, 0]);
});

const text = (value: string) => ({ type: "text" as const, value });
const el = (tagName: string, children: Element["children"]): Element => ({ type: "element", tagName, properties: {}, children });

test("wrapStreamTail: 終わりの文字を、節をまたいで段ごとに包む", () => {
  const tree: Root = { type: "root", children: [el("p", [text("abc"), el("strong", [text("de")]), text("fgh")])] };
  wrapStreamTail(tree, [2, 3, 0]);
  const p = tree.children[0] as Element;
  const fade = (node: unknown) => {
    const e = node as Element;
    return [String((e.properties.className as string[])[0]), (e.children[0] as { value: string }).value];
  };
  // gh が 1 段目、その前の 3 文字（"f" と、strong をまたいだ "de"）が 2 段目、"abc" は段の外
  assert.equal(p.children.length, 4);
  assert.deepEqual(p.children[0], text("abc"));
  assert.deepEqual(fade((p.children[1] as Element).children[0]), ["stream-fade-2", "de"]);
  assert.deepEqual(fade(p.children[2]), ["stream-fade-2", "f"]);
  assert.deepEqual(fade(p.children[3]), ["stream-fade-1", "gh"]);
});

test("wrapStreamTail: コードブロックの中は数えない・段がすべて 0 なら変えない", () => {
  const tree: Root = { type: "root", children: [el("p", [text("ab")]), el("pre", [el("code", [text("xyz")])])] };
  wrapStreamTail(tree, [1, 0, 0]);
  const p = tree.children[0] as Element;
  assert.equal(((p.children[1] as Element).children[0] as { value: string }).value, "b");
  const code = (tree.children[1] as Element).children[0] as Element;
  assert.deepEqual(code.children, [text("xyz")]);
  const untouched: Root = { type: "root", children: [el("p", [text("ab")])] };
  wrapStreamTail(untouched, [0, 0, 0]);
  assert.deepEqual((untouched.children[0] as Element).children, [text("ab")]);
});
