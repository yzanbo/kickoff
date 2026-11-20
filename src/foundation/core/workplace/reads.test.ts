// 作業場所の共通の読み取り（本物の git で）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { assertBranchName, changedCount, currentBranch, gitCommonDir, gitPrefix, hasRef, headSha, isAncestor, isGitWorkTree, isIgnored, isTracked, readRemotes, readStashes, repoTop, upstreamOf } from "./reads";

test("upstreamOf: 名前に「/」を含む remote でも、remote の一覧で割る（追いかけていなければ null）", async () => {
  const origin = gitRepo({ files: { "a.txt": "a\n" } });
  const { dir, git } = gitRepo({ dir: tempDir() });
  git("remote", "add", "team/origin", origin.dir);
  git("fetch", "-q", "team/origin");
  git("switch", "-q", "-c", "feat/x", "--track", "team/origin/main");
  assert.deepEqual(await upstreamOf(dir, "feat/x"), { remote: "team/origin", branch: "main" });
  git("switch", "-q", "-c", "local");
  assert.equal(await upstreamOf(dir, "local"), null);
  assert.deepEqual(await readRemotes(dir), [{ name: "team/origin", url: origin.dir }]);
});

test("readStashes・changedCount: 退避を新しい順に読み、変更の数を数える（scope でその中だけ）", async () => {
  const { dir, git } = gitRepo({ files: { "a.txt": "a\n", "sub/b.txt": "b\n" } });
  assert.equal(await changedCount(dir), 0);
  fs.writeFileSync(path.join(dir, "a.txt"), "changed\n");
  fs.writeFileSync(path.join(dir, "sub/b.txt"), "changed\n");
  fs.writeFileSync(path.join(dir, "new.txt"), "new\n");
  assert.equal(await changedCount(dir), 3);
  assert.equal(await changedCount(dir, { scope: "sub" }), 1);
  git("stash", "push", "-q", "-m", "first", "--", "a.txt");
  git("stash", "push", "-q", "-m", "second", "--", "sub/b.txt");
  const stashes = await readStashes(dir);
  assert.deepEqual(
    stashes.map((s) => [s.ref, s.message]),
    [
      ["stash@{0}", "On main: second"],
      ["stash@{1}", "On main: first"],
    ],
  );
  assert.match(stashes[0].sha, /^[0-9a-f]{40}$/);
});

test("参照・ブランチ・先祖・追跡・無視・リポジトリの場所を読む（Git でなければ false・null）", async () => {
  const { dir, git } = gitRepo({ files: { "a.txt": "a\n", ".gitignore": "out/\n", "app/web/x.txt": "x\n" } });
  const first = (await headSha(dir))!;
  assert.match(first, /^[0-9a-f]{40}$/);
  assert.equal(await hasRef(dir, "refs/heads/main"), true);
  assert.equal(await hasRef(dir, "refs/heads/none"), false);
  assert.equal(await currentBranch(dir), "main");
  fs.writeFileSync(path.join(dir, "a.txt"), "b\n");
  git("commit", "-qam", "second");
  assert.equal(await isAncestor(dir, first, "HEAD"), true);
  assert.equal(await isAncestor(dir, "HEAD", first), false);
  git("switch", "-q", "--detach", first);
  assert.equal(await currentBranch(dir), null);
  assert.equal(await isTracked(dir, "a.txt"), true);
  assert.equal(await isTracked(dir, "none.txt"), false);
  assert.equal(await isIgnored(dir, "out/y.txt"), true);
  assert.equal(await isIgnored(dir, "a.txt"), false);
  const real = fs.realpathSync(dir);
  assert.equal(await repoTop(path.join(dir, "app/web")), real);
  assert.equal(await gitPrefix(path.join(dir, "app/web")), "app/web");
  assert.equal(await gitCommonDir(path.join(dir, "app")), path.join(real, ".git"));
  assert.equal(await isGitWorkTree(dir), true);

  const plain = tempDir();
  assert.equal(await isGitWorkTree(plain), false);
  assert.equal(await headSha(plain), null);
  assert.equal(await repoTop(plain), null);
  assert.equal(await gitPrefix(plain), null);
  assert.equal(await currentBranch(plain), null);
});

test("assertBranchName: git の決まりに合わない名前と「-」で始まる名前を断る", async () => {
  await assertBranchName("feat/x");
  await assert.rejects(assertBranchName("bad..name"), /使えない文字/);
  await assert.rejects(assertBranchName("-x"), /使えない文字/);
});
