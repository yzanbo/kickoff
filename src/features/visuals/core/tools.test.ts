import assert from "node:assert/strict";
import { test } from "vitest";
import { VISUAL_SECTION } from "./tools";

test("図と数式: 図はツールで描き、初めに書き方を読むこと・数式の書き方を伝える（細かい書き方はツールの説明に任せて短く）", () => {
  const prompt = [VISUAL_SECTION.heading, ...VISUAL_SECTION.lines].join("\n");
  assert.ok(prompt.includes("## 図と数式"));
  assert.ok(prompt.includes("show_visual"));
  assert.ok(prompt.includes("visual_guide"));
  assert.ok(prompt.includes("$$ … $$"));
  assert.ok(prompt.includes("\\( … \\)"));
});
