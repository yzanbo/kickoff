import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitRefs } from "@shared/types";
import { refBadgesOf } from "./refBadges";

const known: GitRefs = {
  branches: [
    { name: "main", hash: "a", current: true, upstream: "origin/main", ahead: 0, behind: 0, worktree: null },
    { name: "feature/x", hash: "a", current: false, upstream: null, ahead: 0, behind: 0, worktree: null },
    { name: "dev", hash: "a", current: false, upstream: "upstream/develop", ahead: 0, behind: 0, worktree: null },
  ],
  remotes: [
    { name: "origin", github: true, branches: [{ name: "origin/main", hash: "a" }, { name: "origin/feature/x", hash: "a" }, { name: "origin/dev", hash: "a" }] },
    { name: "upstream", github: false, branches: [{ name: "upstream/develop", hash: "a" }] },
  ],
  tags: [],
  stashes: [],
};

const summary = (refs: string[]) =>
  refBadgesOf(refs, known).map((b) => `${b.head ? "*" : ""}${b.target.kind}:${b.target.name}[${b.remotes.map((r) => `${r.name}${r.github ? "(gh)" : ""}`).join(",")}]`);

test("refBadgesOf: 手元のブランチは、同じコミットの追いかけ先のリモートのブランチをまとめて、リモートのマークを添える", () => {
  assert.deepEqual(summary(["HEAD -> main", "origin/main", "tag: v1"]), ["*branch:main[origin(gh)]", "tag:v1[]"]);
  // 追いかけ先がなければ、同じ名前のリモートのブランチをまとめる
  assert.deepEqual(summary(["feature/x", "origin/feature/x"]), ["branch:feature/x[origin(gh)]"]);
  // 追いかけ先があれば、それだけをまとめる（同じ名前でも、追いかけていないリモートは別の札）
  assert.deepEqual(summary(["dev", "origin/dev", "upstream/develop"]), ["branch:dev[upstream]", "remote:origin/dev[origin(gh)]"]);
});

test("refBadgesOf: 手元のブランチがないリモートのブランチは、それだけで札にする。HEAD そのものは札にしない", () => {
  assert.deepEqual(summary(["origin/main", "origin/HEAD"]), ["remote:origin/main[origin(gh)]"]);
  // 一覧がまだなければ、「/」の前を remote にして GitHub かは分からない（雲のマーク）
  assert.deepEqual(
    refBadgesOf(["origin/main"], undefined).map((b) => b.remotes),
    [[{ name: "origin", github: false }]],
  );
});
