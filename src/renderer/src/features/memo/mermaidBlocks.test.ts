import assert from "node:assert/strict";
import { test } from "node:test";
import { mermaidBlocks } from "./mermaidBlocks";

test("mermaidBlocks: ```mermaid と ~~~mermaid の塊を、開きの行の頭から閉じの行の終わりまで探す", () => {
  const text = "# 図\n\n```mermaid\nflowchart LR\n  A-->B\n```\n\n本文\n~~~~ mermaid\nsequenceDiagram\n~~~~\n";
  const found = mermaidBlocks(text).map((b) => ({ text: text.slice(b.from, b.to), code: b.code }));
  assert.deepEqual(found, [
    { text: "```mermaid\nflowchart LR\n  A-->B\n```", code: "flowchart LR\n  A-->B" },
    { text: "~~~~ mermaid\nsequenceDiagram\n~~~~", code: "sequenceDiagram" },
  ]);
});

test("mermaidBlocks: ほかの言語・閉じていない塊・短い閉じの記号は図にしない", () => {
  assert.deepEqual(mermaidBlocks("```js\nmermaid\n```"), []);
  assert.deepEqual(mermaidBlocks("```mermaid\nflowchart LR\n"), []);
  // 4 つの ` で開いたら、3 つでは閉じない
  const text = "````mermaid\nA\n```\nB\n````";
  assert.deepEqual(mermaidBlocks(text).map((b) => b.code), ["A\n```\nB"]);
});
