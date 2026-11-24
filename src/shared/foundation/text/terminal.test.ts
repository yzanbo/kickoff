import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanTerminalText, tailLines } from "./terminal";

test("端末向けの出力: 色の制御文字を除き、\\r で上書きした行は最後の状態だけにする", () => {
  assert.equal(cleanTerminalText("\x1b[32mok\x1b[0m done"), "ok done");
  assert.equal(cleanTerminalText("\x1b]0;title\x07text"), "text");
  assert.equal(cleanTerminalText("10%\r50%\r100%\nnext"), "100%\nnext");
  assert.equal(cleanTerminalText("progress 3/3\r\nend"), "progress 3/3\nend");
  assert.equal(cleanTerminalText("bar\r"), "bar");
  assert.equal(cleanTerminalText("a\x07b\tc"), "ab\tc");
});

test("最後の n 行（終わりの改行は数えない）", () => {
  assert.equal(tailLines("1\n2\n3\n4\n", 2), "3\n4");
  assert.equal(tailLines("only", 5), "only");
  assert.equal(tailLines("", 3), "");
});
