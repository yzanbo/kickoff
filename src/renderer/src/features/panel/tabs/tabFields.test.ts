import { test } from "node:test";
import assert from "node:assert/strict";
import { groupedTabField, tabFieldShown, toggleTabField } from "./tabFields";

test("groupedTabField: グループ別はグループ・作業場所別は作業場所を隠し、まとめないときは隠さない", () => {
  assert.equal(groupedTabField("group"), "group");
  assert.equal(groupedTabField("worktree"), "worktree");
  assert.equal(groupedTabField("none"), null);
});

test("tabFieldShown: 選んだ項目を出し、まとめ方の項目は選んでいても出さない。別のまとめ方では選んだとおりに出す", () => {
  assert.equal(tabFieldShown("group", [], "none"), true);
  assert.equal(tabFieldShown("group", [], "group"), false);
  assert.equal(tabFieldShown("group", [], "worktree"), true);
  assert.equal(tabFieldShown("worktree", [], "worktree"), false);
  assert.equal(tabFieldShown("worktree", [], "group"), true);
  // 隠した項目は、どのまとめ方でも出さない
  assert.equal(tabFieldShown("state", ["state"], "none"), false);
  assert.equal(tabFieldShown("worktree", ["worktree"], "group"), false);
  // 知らない名前は見ない
  assert.equal(tabFieldShown("pin", ["unknown"], "none"), true);
});

test("toggleTabField: 出す・隠すを入れ替え、項目の一覧の順にそろえる", () => {
  assert.deepEqual(toggleTabField([], "worktree"), ["worktree"]);
  assert.deepEqual(toggleTabField(["worktree"], "state"), ["state", "worktree"]);
  assert.deepEqual(toggleTabField(["state", "worktree"], "state"), ["worktree"]);
});
