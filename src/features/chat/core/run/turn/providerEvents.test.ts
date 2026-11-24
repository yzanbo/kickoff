import { test } from "vitest";
import assert from "node:assert/strict";
import { drawingTracker } from "./providerEvents";

test("図: 図のツールの入力を書いている間だけ立てる（ほかのツールは数えない・重なっても 1 回ずつ）", () => {
  const drawing: boolean[] = [];
  const streaming = drawingTracker((d) => drawing.push(d));
  streaming("Bash", true);
  streaming("mcp__kickoff_chat__show_visual", true);
  streaming("mcp__kickoff_chat__update_visual", true);
  streaming("mcp__kickoff_chat__show_visual", false);
  streaming("Bash", false);
  streaming("mcp__kickoff_chat__update_visual", false);
  assert.deepEqual(drawing, [true, false]);
});
