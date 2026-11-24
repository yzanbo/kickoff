import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatScreens, type ShownScreen } from "./chatScreens";

/** 偽の要素（見えているか・入れ子は親を辿る） */
interface FakeEl { nodeType: 1; isConnected: boolean; offsetParent: object | null; parent: FakeEl | null; contains(o: unknown): boolean }
function el(parent: FakeEl | null = null, shown = true): FakeEl {
  const self: FakeEl = {
    nodeType: 1,
    isConnected: true,
    offsetParent: shown ? {} : null,
    parent,
    contains: (o) => {
      for (let n = o as FakeEl | null; n; n = n.parent) if (n === self) return true;
      return false;
    },
  };
  return self;
}
const screen = (chatId: number, root: FakeEl, extra: Partial<ShownScreen> = {}): ShownScreen =>
  ({ chatId, root: { current: root as unknown as HTMLElement }, ...extra }) as ShownScreen;

test("同じチャットの画面が 2 つあれば見えている方を先に引き、隠れていれば front で先にタブを表に出す", () => {
  const r = createChatScreens();
  const hidden = screen(1, el(null, false), { slot: "a" });
  const shown = screen(1, el(), { slot: "b" });
  r.register(hidden);
  const off = r.register(shown);
  assert.equal(r.screenOfChat(1), shown);
  assert.equal(r.screenAt("a"), hidden);
  assert.deepEqual(r.shownChatIds(), [1]);
  off();
  assert.equal(r.screenOfChat(1), hidden);
  assert.equal(r.isScreenShown(1), false);
  let fronted = 0;
  hidden.bringToFront = () => fronted++;
  r.front(1);
  assert.equal(fronted, 1);
});

test("押した画面は入れ子ならいちばん内側。外を押したら外れ、外した画面は最後に押した画面から消える", () => {
  const r = createChatScreens();
  const outerEl = el();
  const innerEl = el(outerEl);
  const outer = screen(1, outerEl);
  const inner = screen(2, innerEl);
  r.register(outer);
  const offInner = r.register(inner);
  const button = el(innerEl);
  r.pressed(button as unknown as Node);
  assert.equal(r.lastPressedScreen(), inner);
  assert.equal(r.lastPressedElement(), button);
  r.pressed(el() as unknown as Node);
  assert.equal(r.lastPressedScreen(), undefined);
  r.pressed(innerEl as unknown as Node);
  offInner();
  assert.equal(r.lastPressedScreen(), undefined);
});
