import { test } from "vitest";
import assert from "node:assert/strict";
import { describeMoveWorkplace, workplaceMoveReservationText } from "./aiWorkplace";

test("describeMoveWorkplace: 移す先と、変更を持っていくか", () => {
  assert.equal(describeMoveWorkplace({ to: "main" }), "本体");
  assert.equal(describeMoveWorkplace({ to: "worktree", worktree: " feat/a " }), "ワークツリー（feat/a）");
  assert.equal(describeMoveWorkplace({ to: "new_worktree", branch: "feat/b", carry: true }), "新しいワークツリー（feat/b）（変更を持っていく）");
});

test("workplaceMoveReservationText: 移す先・持っていくか・続きを送るか", () => {
  assert.equal(workplaceMoveReservationText({ label: "本体", carry: false, continuation: true }), "作業が終わったら本体へ移ります。移したら AI が続けます");
  assert.equal(
    workplaceMoveReservationText({ label: "新しいワークツリー（feat/a）", carry: true, continuation: false }),
    "作業が終わったら新しいワークツリー（feat/a）へ移ります（コミットしていない変更も持っていきます）。移すだけで、続きは送りません",
  );
});
