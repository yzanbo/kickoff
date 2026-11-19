import assert from "node:assert/strict";
import { test } from "vitest";
import { PROJECT_HUES, workplaceDefaultHue } from "@shared/project/colors";
import { makeWorktree } from "@shared/testing/factories";
import { workplaceOf } from "./workplace";
import { workplaceHue } from "./workplaceHue";

test("作業場所の色: コアが一覧に付けた色を使い、ブランチ・一覧の順序・ほかの作業場所が変わっても変わらない", () => {
  const a = makeWorktree("/repo-worktrees/a", { branch: "feat/a", hue: 135 });
  const before = [makeWorktree("/repo", { branch: "main", main: true, hue: 28 }), a];
  const after = [makeWorktree("/repo", { branch: "other", main: true, hue: 28 }), makeWorktree("/repo-worktrees/new", { branch: "aaa", hue: 200 }), { ...a, branch: "zzz" }];
  const place = workplaceOf({ worktree_path: a.path, branch: null }, before);
  assert.equal(workplaceHue(5, place, before), 135);
  assert.equal(workplaceHue(5, place, after), 135);
  assert.equal(workplaceHue(5, workplaceOf({ worktree_path: null, branch: null }, after), after), 28);
});

test("作業場所の色: 一覧を読む前・一覧にない作業場所は、キーから決まる色（本体はコアの色と同じ決め方）", () => {
  const list = [makeWorktree("/repo", { branch: "main", main: true, hue: workplaceDefaultHue(5, "") })];
  const main = workplaceOf({ worktree_path: null, branch: null }, list);
  assert.equal(workplaceHue(5, main, list), workplaceHue(5, main, undefined));
  const gone = { key: "/repo-worktrees/gone" };
  assert.equal(workplaceHue(5, gone, list), workplaceDefaultHue(5, gone.key));
  assert.ok((PROJECT_HUES as readonly number[]).includes(workplaceHue(5, gone, list)));
});
