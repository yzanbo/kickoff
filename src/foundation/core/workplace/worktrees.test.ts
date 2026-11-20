// 作業場所の一覧と解決（いちばん深い作業場所・?worktree= の解き方・一覧の覚え）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { addWorktree, deepestWorkplace, forgetWorktrees, listWorktrees, removeWorktree, requireWorktree, resolveWorkdir } from "./worktrees";

test("deepestWorkplace: いちばん深い作業場所。末尾の / や似た名前のフォルダで間違えない", () => {
  const wps = [{ path: "/r/app" }, { path: "/r/app/.wt/feat" }, { path: "/r/app-2" }];
  assert.equal(deepestWorkplace("/r/app/sub", wps)?.path, "/r/app");
  assert.equal(deepestWorkplace("/r/app/.wt/feat", wps)?.path, "/r/app/.wt/feat");
  assert.equal(deepestWorkplace("/r/app-2/x", wps)?.path, "/r/app-2");
  assert.equal(deepestWorkplace("/r/application", wps), undefined);
});

test("一覧は作った・消したとき・forgetWorktrees で取り直す。?worktree= を解く", async () => {
  const { dir: repo, git } = gitRepo({ dir: path.join(tempDir(), "app"), files: { "a.txt": "a\n" } });
  assert.equal((await listWorktrees(repo)).length, 1);
  // Kickoff の外で足したもの（HEAD の見張りが覚えを捨てる）
  const outside = path.join(path.dirname(repo), "outside");
  git("worktree", "add", "-q", "-b", "outside", outside);
  forgetWorktrees(repo);
  assert.equal((await listWorktrees(repo)).length, 2);
  // Kickoff で作った・消したら、すぐ一覧に出る・消える
  const made = (await addWorktree(repo, "feat/x")).find((w) => w.branch === "feat/x")!;
  assert.ok(made);
  assert.equal((await listWorktrees(repo)).length, 3);
  assert.equal(await resolveWorkdir(repo, made.path), made.path);
  assert.equal(await resolveWorkdir(repo, undefined), repo);
  assert.equal(await requireWorktree(repo, undefined), null);
  await assert.rejects(requireWorktree(repo, "/nowhere"), /このプロジェクトのワークツリーではありません/);
  assert.equal((await removeWorktree(repo, made.path, { force: true })).length, 2);
  // 返した一覧を書き換えても、覚えたものは変わらない
  const list = await listWorktrees(repo);
  list[0].branch = "changed";
  list.pop();
  assert.deepEqual(
    (await listWorktrees(repo)).map((w) => w.branch),
    ["main", "outside"],
  );
  fs.rmSync(outside, { recursive: true, force: true });
});
