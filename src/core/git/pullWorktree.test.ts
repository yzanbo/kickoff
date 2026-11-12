// PR のブランチのワークツリー（取り出し方の決め方と、本物の git での取り出し）
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { GitHubRemote } from "@shared/types";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";
import { checkoutPullWorktree, pullCheckoutOf } from "./pullWorktree.js";

const remote = (name: string, repo: string, url = ""): GitHubRemote => ({ name, repo, url });

test("取り出し方: 元のブランチのリポジトリを remote に持っていればそのブランチ名（大文字・小文字は問わない）、なければ pr-N", () => {
  const remotes = [remote("upstream", "acme/app"), remote("origin", "me/app")];
  assert.deepEqual(pullCheckoutOf({ number: 3, head_ref: "fix", head_repo: "Acme/App" }, remotes), { branch: "fix", remote: "upstream" });
  assert.deepEqual(pullCheckoutOf({ number: 3, head_ref: "fix", head_repo: "me/app" }, remotes), { branch: "fix", remote: "origin" });
  assert.deepEqual(pullCheckoutOf({ number: 3, head_ref: "fix", head_repo: "other/app" }, remotes), { branch: "pr-3", remote: null });
  assert.deepEqual(pullCheckoutOf({ number: 4, head_ref: "fix", head_repo: null }, remotes), { branch: "pr-4", remote: null });
});

/** 連携先の代わりの bare のリポジトリ（main と、PR の元のブランチ fix と、ほかの人の fork の PR の refs/pull/9/head） */
function setupRemote() {
  const src = gitRepo({ files: { "a.txt": "a\n" } });
  src.git("checkout", "-q", "-b", "fix");
  fs.writeFileSync(path.join(src.dir, "a.txt"), "fixed\n");
  src.git("commit", "-q", "-am", "fix");
  src.git("checkout", "-q", "main");
  const bare = path.join(tempDir(), "origin.git");
  execFileSync("git", ["clone", "-q", "--bare", src.dir, bare]);
  // ほかの人の fork の PR（ブランチは連携先にない。refs/pull/9/head だけがある）
  src.git("checkout", "-q", "-b", "theirs");
  fs.writeFileSync(path.join(src.dir, "b.txt"), "theirs\n");
  src.git("add", "-A");
  src.git("commit", "-q", "-m", "theirs");
  src.git("push", "-q", bare, "theirs:refs/pull/9/head");
  const theirs = src.git("rev-parse", "HEAD").trim();
  const local = path.join(tempDir(), "app");
  execFileSync("git", ["clone", "-q", bare, local]);
  return { local, theirs, git: gitIn(local) };
}

test("ワークツリー: 同じリポジトリの PR は元のブランチを追いかける同じ名前で、ほかの人の fork は pr-N で作り、2 回目はあるものを返す", async () => {
  const { local, theirs, git } = setupRemote();
  const remotes = [remote("origin", "acme/app")];

  const same = await checkoutPullWorktree(local, { number: 1, head_ref: "fix", head_repo: "acme/app" }, remotes, "origin");
  assert.equal(same.branch, "fix");
  assert.equal(same.main, false);
  assert.equal(fs.readFileSync(path.join(same.path, "a.txt"), "utf8"), "fixed\n");
  assert.equal(git("rev-parse", "--abbrev-ref", "fix@{upstream}").trim(), "origin/fix");

  const fork = await checkoutPullWorktree(local, { number: 9, head_ref: "main", head_repo: "someone/app" }, remotes, "origin");
  assert.equal(fork.branch, "pr-9");
  assert.equal(git("rev-parse", "pr-9").trim(), theirs);
  assert.ok(fs.existsSync(path.join(fork.path, "b.txt")));

  const again = await checkoutPullWorktree(local, { number: 1, head_ref: "fix", head_repo: "acme/app" }, remotes, "origin");
  assert.equal(again.path, same.path);
});

test("ワークツリー: そのブランチを本体で取り出していれば本体を返す（作らない）", async () => {
  const { local, git } = setupRemote();
  git("checkout", "-q", "fix");
  const found = await checkoutPullWorktree(local, { number: 1, head_ref: "fix", head_repo: "acme/app" }, [remote("origin", "acme/app")], "origin");
  assert.equal(found.main, true);
});
