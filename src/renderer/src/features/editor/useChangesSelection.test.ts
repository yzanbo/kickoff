import assert from "node:assert/strict";
import { test } from "node:test";
import { editedChange, selectedChange, type ChangeGroups } from "./useChangesSelection";

const groups: ChangeGroups = {
  staged: [{ path: "a.ts", kind: "M" }, { path: "b.ts", kind: "R", old_path: "old.ts" }],
  unstaged: [{ path: "a.ts", kind: "M" }, { path: "c.ts", kind: "U" }],
};

test("selectedChange: 変更の一覧から選んだときだけ差分。「編集」・エクスプローラー・検索の行からは中身を出す", () => {
  assert.deepEqual(selectedChange({ path: "a.ts", staged: true }, groups), { file: groups.staged[0], staged: true });
  assert.deepEqual(selectedChange({ path: "a.ts", staged: false }, groups), { file: groups.unstaged[0], staged: false });
  assert.equal(selectedChange({ path: "a.ts", staged: true, edit: true }, groups), undefined);
  assert.equal(selectedChange({ path: "a.ts" }, groups), undefined);
  assert.equal(selectedChange({ path: "a.ts", line: 3 }, groups), undefined);
});

test("editedChange: 来た方の差分。なくなっていればもう一方、どちらにもなければ undefined", () => {
  assert.deepEqual(editedChange({ path: "a.ts", staged: true, edit: true }, groups), { file: groups.staged[0], staged: true });
  assert.deepEqual(editedChange({ path: "a.ts", staged: false, edit: true }, groups), { file: groups.unstaged[0], staged: false });
  assert.deepEqual(editedChange({ path: "c.ts", staged: true, edit: true }, groups), { file: groups.unstaged[1], staged: false });
  assert.deepEqual(editedChange({ path: "b.ts", edit: true }, groups)?.file.old_path, "old.ts");
  assert.equal(editedChange({ path: "z.ts", edit: true }, groups), undefined);
  assert.equal(editedChange({ path: "a.ts" }, groups), undefined);
});
