import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitRefs } from "@shared/types";
import { refTargetOf } from "./refTarget";

const refs: GitRefs = {
  branches: [{ name: "feature/x", hash: "a", current: false, upstream: null, ahead: 0, behind: 0, worktree: null }],
  remotes: [{ name: "origin", branches: [{ name: "origin/main", hash: "b" }] }],
  tags: [],
  stashes: [],
};

test("refTargetOf: コミットの札の文を、手元のブランチ・リモートのブランチ・タグに分ける（「/」を含む手元のブランチは一覧で見分ける）", () => {
  assert.deepEqual(refTargetOf("HEAD -> main", refs), { kind: "branch", name: "main" });
  assert.deepEqual(refTargetOf("tag: v1.0", refs), { kind: "tag", name: "v1.0" });
  assert.deepEqual(refTargetOf("feature/x", refs), { kind: "branch", name: "feature/x" });
  assert.deepEqual(refTargetOf("origin/main", refs), { kind: "remote", name: "origin/main" });
  // 一覧がまだないときは、「/」の有無で見当を付ける
  assert.deepEqual(refTargetOf("upstream/dev", undefined), { kind: "remote", name: "upstream/dev" });
  assert.deepEqual(refTargetOf("dev", undefined), { kind: "branch", name: "dev" });
  // HEAD そのもの・リモートの HEAD は札にしない
  assert.equal(refTargetOf("HEAD", refs), null);
  assert.equal(refTargetOf("origin/HEAD", refs), null);
});
