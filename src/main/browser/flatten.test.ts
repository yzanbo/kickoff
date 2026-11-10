import assert from "node:assert/strict";
import { test } from "node:test";
import { flattenOnWhite } from "./flatten.js";

test("flattenOnWhite: 透明は白、不透明はそのまま、半透明は白と混ぜる（色に透明度を掛けた形）", () => {
  const pixels = new Uint8Array([0, 0, 0, 0, 10, 20, 30, 255, 50, 0, 100, 128]);
  assert.deepEqual([...flattenOnWhite(pixels)], [255, 255, 255, 255, 10, 20, 30, 255, 177, 127, 227, 255]);
});
