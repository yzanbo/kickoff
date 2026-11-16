import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlockScanner } from "./markdownBlocks";

test("最後のブロックの頭は空行のあとの最初の行。空行で終わっていれば、次の行が来るまで前のブロックのまま", () => {
  const scan = (text: string) => createBlockScanner().scan(text);
  assert.equal(scan("一\n二").blockStart, 0);
  assert.equal(scan("一\n\n二").blockStart, 3);
  assert.equal(scan("一\n\n").blockStart, 0);
  assert.equal(scan("一\n\n\n三\n四").blockStart, 4);
});

test("コードブロック・数式ブロックの中の空行では分けず、開いたままなら開きの位置を返す", () => {
  const scanner = createBlockScanner();
  const text = "前\n\n```ts\na\n\nb\n```\n後\n\n$$\nx\n\ny";
  assert.deepEqual(scanner.scan(text, 9), { blockStart: 3, fence: { start: 3, char: "`", length: 3, infoDone: true }, mathStart: null, closedAt: 0 });
  const tail = scanner.scan(text);
  assert.equal(tail.fence, null);
  assert.equal(tail.mathStart, text.indexOf("$$"));
  assert.equal(tail.blockStart, text.indexOf("$$"));
  assert.equal(tail.closedAt, text.indexOf("後"));
  // 開きの行の書きかけ（改行がまだ）
  assert.deepEqual(createBlockScanner().scan("前\n~~~~py").fence, { start: 2, char: "~", length: 4, infoDone: false });
  // ``` の言語名に ` があれば開きではない
  assert.equal(createBlockScanner().scan("```a`b\n").fence, null);
});

test("続きでない文が来たら初めから読み直す", () => {
  const scanner = createBlockScanner();
  assert.notEqual(scanner.scan("```\ncode\n").fence, null);
  assert.equal(scanner.scan("別の\n\n文").fence, null);
  assert.equal(scanner.scan("別の\n\n文").blockStart, 4);
});
