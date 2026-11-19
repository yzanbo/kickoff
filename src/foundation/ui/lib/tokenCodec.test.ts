import assert from "node:assert/strict";
import { test } from "vitest";
import { decodeTokens, encodeTokens, type CodeToken } from "./tokenCodec";

test("encodeTokens / decodeTokens: 詰めて戻すと元と同じ（色なし・字形・同じ色の使い回し・空の行）", () => {
  const code = "const a = 1;\n\n// 注釈";
  const lines: CodeToken[][] = [
    [{ content: "const", color: "#569CD6" }, { content: " a = " }, { content: "1", color: "#B5CEA8" }, { content: ";", color: "#569CD6" }],
    [],
    [{ content: "// 注釈", color: "#6A9955", fontStyle: 1 }],
  ];
  const encoded = encodeTokens(code, lines);
  assert.ok(encoded);
  assert.deepEqual(encoded.palette, ["#569CD6", "#B5CEA8", "#6A9955"]);
  assert.deepEqual(decodeTokens(code, encoded), lines);
});

test("encodeTokens: 断片をつないだものが行と違う・行の数が違うときは詰めない（null）", () => {
  assert.equal(encodeTokens("ab", [[{ content: "a" }]]), null);
  assert.equal(encodeTokens("a\nb", [[{ content: "a" }]]), null);
});
