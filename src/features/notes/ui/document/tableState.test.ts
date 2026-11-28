import assert from "node:assert/strict";
import { test } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { NOTE_MARKDOWN_EXTENSIONS } from "./noteMarkdown";
import { openCellOf, tableCellField } from "./tableField";
import { editorFocusEffect, editTable, fromCell, openCellEffect } from "./tableState";

const DOC = "前の行\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n後ろの行";
const create = () => EditorState.create({ doc: DOC, extensions: [markdown({ base: markdownLanguage, extensions: NOTE_MARKDOWN_EXTENSIONS }), tableCellField] });
const tableFrom = DOC.indexOf("| a");
const focus = (s: EditorState, focused: boolean) => s.update({ effects: editorFocusEffect.of(focused) }).state;

test("tableField: セルを開く effect で開き、ピントが外へ出たら閉じる", () => {
  let s = create().update({ effects: openCellEffect.of({ tableFrom, row: 1, col: 1 }) }).state;
  assert.deepEqual(openCellOf(s), { tableFrom, row: 1, col: 1 });
  s = focus(s, false);
  assert.equal(openCellOf(s), null);
});

test("tableField: 選んだ範囲が表のセルに入ったら（元に戻す・検索など）そのセルを開き、表の外へ出たら閉じる", () => {
  let s = focus(create(), true);
  s = s.update({ selection: { anchor: DOC.indexOf("2") } }).state;
  assert.deepEqual(openCellOf(s), { tableFrom, row: 1, col: 1 });
  s = s.update({ selection: { anchor: DOC.indexOf("後ろ") } }).state;
  assert.equal(openCellOf(s), null);
});

test("tableField: セルの部品から写した選んだ範囲では選び直さない（足りないセルを開いたまま）", () => {
  let s = focus(create(), true).update({ effects: openCellEffect.of({ tableFrom, row: 1, col: 0 }) }).state;
  s = s.update({ selection: { anchor: DOC.indexOf("2") }, annotations: fromCell.of(true) }).state;
  assert.deepEqual(openCellOf(s), { tableFrom, row: 1, col: 0 });
});

test("editTable: そろえた表は書き換えたあとにそろえ直す書き換えを続け、詰めた表はそのまま。表の頭は書き換えに合わせて動かす", () => {
  const aligned = "前\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |";
  const s = EditorState.create({ doc: aligned, extensions: [markdown({ base: markdownLanguage, extensions: NOTE_MARKDOWN_EXTENSIONS })] });
  const from = aligned.indexOf("| a");
  const at = aligned.indexOf("1");
  const edit = editTable(s, from, { from: at, to: at + 1, insert: "長い文" });
  assert.equal(edit?.state.doc.toString(), "前\n\n| a      | b   |\n| ------ | --- |\n| 長い文 | 2   |");
  assert.equal(edit?.tableFrom, from);
  const compact = editTable(create(), tableFrom, { from: DOC.indexOf("1"), to: DOC.indexOf("1") + 1, insert: "長い" });
  assert.deepEqual(compact?.later, []);
  assert.equal(editTable(create(), tableFrom, { from: 0, insert: "足した\n" })?.tableFrom, tableFrom + 4);
  assert.equal(editTable(create(), 0, { from: 0, insert: "x" }), null);
});

test("tableField: ピントが戻ったとき、カーソルが表の中ならそのセルを開く。前の行が増えても同じ表を指す", () => {
  let s = focus(create(), true).update({ selection: { anchor: DOC.indexOf("1") } }).state;
  s = focus(s, false);
  assert.equal(openCellOf(s), null);
  s = focus(s, true);
  assert.deepEqual(openCellOf(s), { tableFrom, row: 1, col: 0 });
  s = s.update({ changes: { from: 0, insert: "足した行\n" }, annotations: fromCell.of(true) }).state;
  assert.deepEqual(openCellOf(s), { tableFrom: tableFrom + 5, row: 1, col: 0 });
});
