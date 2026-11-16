import assert from "node:assert/strict";
import { test } from "vitest";
import { computeLines } from "./highlightCore";
import { decodeTokens, encodeTokens } from "./tokenCodec";

test("computeLines: 行ごとの色付きの断片（断片をつなぐと元の行）。色を付けない言語は null", async () => {
  const code = 'const a: number = 1; // 注釈\nexport function f() {\n  return "x";\n}';
  const lines = await computeLines(code, "typescript", "dark");
  assert.ok(lines);
  assert.deepEqual(
    lines.map((l) => l.map((t) => t.content).join("")),
    code.split("\n"),
  );
  assert.ok(lines[0].some((t) => t.content === "const" && t.color));
  // ライトとダークで色が違う
  const light = await computeLines(code, "typescript", "light");
  assert.notEqual(light?.[0].find((t) => t.content === "const")?.color, lines[0].find((t) => t.content === "const")?.color);
  assert.equal(await computeLines(code, "brainfuck", "dark"), null);
  // Worker から渡すときに詰めて戻しても同じ
  const encoded = encodeTokens(code, lines);
  assert.ok(encoded);
  assert.deepEqual(decodeTokens(code, encoded), lines);
});

test("computeLines: シェルの heredoc の本文は、言語が分かればその言語で色を付け直す", async () => {
  const code = "python3 - <<'EOF'\nimport os\nprint(os.getcwd())\nEOF";
  const shell = await computeLines(code, "shellscript", "dark");
  const python = await computeLines("import os\nprint(os.getcwd())", "python", "dark");
  assert.ok(shell && python);
  assert.deepEqual(shell.slice(1, 3), python);
});
