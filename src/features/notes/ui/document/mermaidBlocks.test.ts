import assert from "node:assert/strict";
import { test } from "vitest";
import { mermaidBlocks } from "./mermaidBlocks";
import { noteMarkdownParser } from "./noteMarkdown";

const blocksOf = (text: string) => mermaidBlocks(noteMarkdownParser.parse(text), text);

test("mermaidBlocks: ```mermaid と ~~~mermaid の塊を、開きの行の頭から閉じの行の終わりまで探す", () => {
  const text = "# 図\n\n```mermaid\nflowchart LR\n  A-->B\n```\n\n本文\n\n~~~~ mermaid\nsequenceDiagram\n~~~~\n";
  const found = blocksOf(text).map((b) => ({ text: text.slice(b.from, b.to), code: b.code }));
  assert.deepEqual(found, [
    { text: "```mermaid\nflowchart LR\n  A-->B\n```", code: "flowchart LR\n  A-->B" },
    { text: "~~~~ mermaid\nsequenceDiagram\n~~~~", code: "sequenceDiagram" },
  ]);
});

test("mermaidBlocks: ほかの言語・閉じていない塊・短い閉じの記号は図にしない", () => {
  assert.deepEqual(blocksOf("```js\nmermaid\n```"), []);
  assert.deepEqual(blocksOf("```mermaid\nflowchart LR\n"), []);
  // 4 つの ` で開いたら、3 つでは閉じない
  assert.deepEqual(blocksOf("````mermaid\nA\n```\nB\n````").map((b) => b.code), ["A\n```\nB"]);
});

test("mermaidBlocks: 言語名は info の先頭の語（返答の表示と同じ）。ほかの塊の中に書いた ```mermaid の例は図にしない", () => {
  assert.deepEqual(blocksOf("```mermaid 図の名前\nA-->B\n```").map((b) => b.code), ["A-->B"]);
  assert.deepEqual(blocksOf("```Mermaid\nA-->B\n```").map((b) => b.code), ["A-->B"]);
  assert.deepEqual(blocksOf("````md\n```mermaid\nA-->B\n```\n````"), []);
  // リストの中の塊は字下げを除いた中身
  assert.deepEqual(blocksOf("- 項目\n\n  ```mermaid\n  A-->B\n  ```").map((b) => b.code), ["A-->B"]);
});
