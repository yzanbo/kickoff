import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { runTargetRange } from "./sqlRunMark";

const at = (doc: string, anchor: number, head = anchor) => EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });

test("runTargetRange: カーソルの文、選んでいればその範囲。空なら null", () => {
  const doc = "select 1;\n\nselect *\nfrom t;";
  const second = runTargetRange(at(doc, doc.indexOf("from")), "sqlite");
  assert.equal(doc.slice(second!.from, second!.to).trim().replace(/;$/, ""), "select *\nfrom t");
  const first = runTargetRange(at(doc, 3), "sqlite");
  assert.match(doc.slice(first!.from, first!.to), /^select 1/);
  assert.deepEqual(runTargetRange(at(doc, 0, 4), "sqlite"), { from: 0, to: 4 });
  assert.equal(runTargetRange(at("  ", 1), "sqlite"), null);
});
