import assert from "node:assert/strict";
import { test } from "vitest";
import { mermaidBoxHeight, mermaidEstimate, rememberMermaidHeight } from "./renderMermaid";

test("mermaidEstimate: 枠の最小 96px に空でない 1 行ごとに 22px、上限 600px", () => {
  assert.equal(mermaidEstimate("graph TD"), 118);
  assert.equal(mermaidEstimate("graph TD\n  A-->B\n\n  B-->C\n"), 96 + 22 * 3);
  assert.equal(mermaidEstimate(Array.from({ length: 40 }, (_, i) => `A${i}-->B`).join("\n")), 600);
});

test("mermaidBoxHeight: 描いたときの高さを覚えていればそれ、なければ見積もり（0 は覚えない）", () => {
  const code = "graph LR\n  覚える-->高さ";
  assert.equal(mermaidBoxHeight(code), mermaidEstimate(code));
  rememberMermaidHeight(code, 0);
  assert.equal(mermaidBoxHeight(code), mermaidEstimate(code));
  rememberMermaidHeight(code, 321);
  assert.equal(mermaidBoxHeight(code), 321);
});
