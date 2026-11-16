import assert from "node:assert/strict";
import { test } from "vitest";
import { scrollsUpKey, snapTarget } from "./followScroll";

test("snapTarget: 一番下からのずれが 2px 以下なら寄せず、それより離れていれば一番下へ", () => {
  assert.equal(snapTarget({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }), null);
  assert.equal(snapTarget({ scrollTop: 499, scrollHeight: 1000, clientHeight: 500 }), null);
  assert.equal(snapTarget({ scrollTop: 498, scrollHeight: 1000, clientHeight: 500 }), null);
  assert.equal(snapTarget({ scrollTop: 497, scrollHeight: 1000, clientHeight: 500 }), 500);
  assert.equal(snapTarget({ scrollTop: 200, scrollHeight: 1030, clientHeight: 500 }), 530);
});

test("snapTarget: 中身が枠より短ければ寄せる先は 0", () => {
  assert.equal(snapTarget({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }), null);
  assert.equal(snapTarget({ scrollTop: 10, scrollHeight: 300, clientHeight: 500 }), 0);
});

test("scrollsUpKey: ↑・PageUp・Home・Shift+Space は上へ戻すキー。修飾キー付き・下へのキーは違う", () => {
  const key = (k: string, mods: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    key: k,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });
  assert.equal(scrollsUpKey(key("ArrowUp")), true);
  assert.equal(scrollsUpKey(key("PageUp")), true);
  assert.equal(scrollsUpKey(key("Home")), true);
  assert.equal(scrollsUpKey(key(" ", { shiftKey: true })), true);
  assert.equal(scrollsUpKey(key(" ")), false);
  assert.equal(scrollsUpKey(key("ArrowDown")), false);
  assert.equal(scrollsUpKey(key("End")), false);
  assert.equal(scrollsUpKey(key("ArrowUp", { metaKey: true })), false);
  assert.equal(scrollsUpKey(key("ArrowUp", { altKey: true })), false);
  assert.equal(scrollsUpKey(key("ArrowUp", { shiftKey: true })), false);
});
