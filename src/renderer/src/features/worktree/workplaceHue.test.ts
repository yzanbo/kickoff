import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_HUES } from "@shared/project/colors";
import type { GitWorktree } from "@shared/types";
import { workplaceOf } from "./workplace";
import { workplaceHue } from "./workplaceHue";

const wt = (path: string, branch: string, extra: Partial<GitWorktree> = {}): GitWorktree => ({
  path,
  branch,
  head: "a1b2c3d4e5f6",
  main: false,
  locked: false,
  prunable: false,
  ...extra,
});

test("作業場所の色: 同じ作業場所はいつも同じ色（一覧を取り直しても）", () => {
  const list = [wt("/repo", "main", { main: true }), wt("/repo-worktrees/a", "feat/a")];
  const again = list.map((w) => ({ ...w }));
  const place = workplaceOf({ worktree_path: "/repo-worktrees/a", branch: null }, list);
  assert.equal(workplaceHue(5, place, list), workplaceHue(5, place, again));
  assert.ok((PROJECT_HUES as readonly number[]).includes(workplaceHue(5, place, list)));
});

test("作業場所の色: いまある作業場所どうしは被らない（10 色まで）", () => {
  const list = [wt("/repo", "main", { main: true }), ...Array.from({ length: 9 }, (_, i) => wt(`/repo-worktrees/w${i}`, `feat/${i}`))];
  const hues = list.map((w) => workplaceHue(5, workplaceOf({ worktree_path: w.main ? null : w.path, branch: null }, list), list));
  assert.equal(new Set(hues).size, 10);
});

test("作業場所の色: 一覧を読む前・一覧にない作業場所は、キーから決まる色", () => {
  const list = [wt("/repo", "main", { main: true })];
  const main = workplaceOf({ worktree_path: null, branch: null }, list);
  // 本体だけなら、一覧を読む前と同じ色（被る相手がいないので好みの色のまま）
  assert.equal(workplaceHue(5, main, list), workplaceHue(5, main, undefined));
  const past = { key: "branch:feat/old" };
  assert.equal(workplaceHue(5, past, list), workplaceHue(5, past, undefined));
});
