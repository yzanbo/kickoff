import assert from "node:assert/strict";
import { test } from "vitest";
import { hasInvisibleChar, stripInvisibleChars } from "./invisibleChars";

test("見えない文字: 制御文字・ゼロ幅・左右の印・埋め込みと分離の印・BOM を見つけて消す", () => {
  for (const c of ["\u0000", "\t", "\n", "\u001f", "\u007f", "\u0085", "\u009f", "​", "‎", "‏", "‪", "‮", "⁠", "⁦", "⁩", "﻿"]) {
    assert.equal(hasInvisibleChar(`a${c}b`), true, c.codePointAt(0)!.toString(16));
    assert.equal(stripInvisibleChars(`a${c}b${c}`), "ab");
  }
  // 見える文字・ふつうの空白・全角の空白は残す（空白の扱いは使う側が決める）
  for (const text of ["abc", "a b", "a　b", "日本語", " ", " "]) {
    assert.equal(hasInvisibleChar(text), false, text);
    assert.equal(stripInvisibleChars(text), text);
  }
});
