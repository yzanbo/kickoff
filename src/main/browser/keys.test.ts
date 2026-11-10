import assert from "node:assert/strict";
import { test } from "node:test";
import { browserKeyCode } from "./keys.js";

test("browserKeyCode: Web のキーの名前を Electron の名前にし、大文字・小文字を問わない。1 文字と知らない名前はそのまま", () => {
  assert.equal(browserKeyCode("ArrowDown"), "Down");
  assert.equal(browserKeyCode("enter"), "Enter");
  assert.equal(browserKeyCode("Return"), "Enter");
  assert.equal(browserKeyCode("esc"), "Escape");
  assert.equal(browserKeyCode("pagedown"), "PageDown");
  assert.equal(browserKeyCode(" "), "Space");
  assert.equal(browserKeyCode("a"), "a");
  assert.equal(browserKeyCode("F5"), "F5");
});
