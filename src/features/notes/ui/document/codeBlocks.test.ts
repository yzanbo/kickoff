import assert from "node:assert/strict";
import { test } from "vitest";
import { codeBlocks, tokenRanges } from "./codeBlocks";
import { noteMarkdownParser } from "./noteMarkdown";

const blocksOf = (text: string) => codeBlocks(noteMarkdownParser.parse(text), text);

test("codeBlocks: 開きの行・言語名・中身（リストの中は字下げを除く）", () => {
  const text = "前\n\n```ts\nconst a = 1;\nlet b;\n```\n\n- 項目\n\n  ~~~sh\n  echo x\n  ~~~\n";
  const [ts, sh] = blocksOf(text);
  assert.equal(text.slice(ts.headFrom, ts.headTo), "```ts");
  assert.equal(ts.info, "ts");
  assert.equal(ts.code, "const a = 1;\nlet b;");
  assert.equal(ts.closed, true);
  assert.equal(sh.code, "echo x");
  assert.equal(text.slice(sh.lines[0].from, sh.lines[0].from + 4), "echo");
});

test("codeBlocks: 閉じていない塊・空の塊・引用の中の塊（飾らない）", () => {
  const [open] = blocksOf("```js\nx\ny");
  assert.equal(open.closed, false);
  assert.equal(open.code, "x\ny");
  const [empty] = blocksOf("```\n```");
  assert.equal(empty.code, "");
  assert.deepEqual(blocksOf("> ```\n> a\n> ```"), []);
});

test("tokenRanges: 色付けの断片を文の中の範囲にする（色のない断片は飛ばす。行の数が違えば空）", () => {
  const text = "```ts\nlet a\n```";
  const [b] = blocksOf(text);
  const ranges = tokenRanges(b, [[{ content: "let", color: "#f00" }, { content: " " }, { content: "a", color: "#0f0", fontStyle: 1 }]]);
  assert.deepEqual(
    ranges.map((r) => [text.slice(r.from, r.to), r.style]),
    [
      ["let", "color: #f00"],
      ["a", "color: #0f0; font-style: italic"],
    ],
  );
  assert.deepEqual(tokenRanges(b, []), []);
});
