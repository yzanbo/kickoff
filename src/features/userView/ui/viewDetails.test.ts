import { test } from "vitest";
import assert from "node:assert/strict";
import { editorCursorOf, noteSelectionOf, registerEditorCursor, registerNoteSelection } from "./viewDetails";

test("エディタのカーソル: 開いている間だけ読め、同じファイルは最後に置いた口、外したら null", () => {
  assert.equal(editorCursorOf(1, "a.ts"), null);
  const offFirst = registerEditorCursor(1, "a.ts", () => ({ line: 3, selection: null }));
  const offSecond = registerEditorCursor(1, "a.ts", () => ({ line: 9, selection: null }));
  assert.equal(editorCursorOf(1, "a.ts")?.line, 9);
  // ほかのプロジェクトの同じパスは別のもの
  assert.equal(editorCursorOf(2, "a.ts"), null);
  offSecond();
  offFirst();
  assert.equal(editorCursorOf(1, "a.ts"), null);
});

test("ノートの選んでいる文: 選んでいない（空の文）は null", () => {
  let selected = "";
  const off = registerNoteSelection(1, "設計.md", () => selected);
  assert.equal(noteSelectionOf(1, "設計.md"), null);
  selected = "画面の節";
  assert.equal(noteSelectionOf(1, "設計.md"), "画面の節");
  off();
  assert.equal(noteSelectionOf(1, "設計.md"), null);
});
