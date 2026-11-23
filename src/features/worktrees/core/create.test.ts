import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import { addWorktree } from "./create";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";

/** 本体（root/app）。node_modules は Git で無視するか、追加せずに置いておくだけ */
function repoWith(ignoreNodeModules: boolean) {
  const root = tempDir({ real: true });
  const { dir: repo } = gitRepo({ dir: path.join(root, "app"), files: ignoreNodeModules ? { ".gitignore": "node_modules/\n" } : { "README.md": "app\n" } });
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "module.exports = 1;");
  return { root, repo };
}

test("addWorktree: 本体の node_modules（Git で無視しているもの）を、新しいワークツリーに写す", async () => {
  const { root, repo } = repoWith(true);
  assert.equal((await listWorktrees(repo)).length, 1);
  await addWorktree(repo, "feat/x");
  // 作ったら一覧の覚えを捨てるので、すぐ一覧に出る
  assert.equal((await listWorktrees(repo)).length, 2);
  const target = path.join(root, "app-worktrees", "feat-x");
  assert.equal(fs.readFileSync(path.join(target, "node_modules", "pkg", "index.js"), "utf8"), "module.exports = 1;");
  // 本物のフォルダとして写す（ワークツリーで書き換えても本体は変わらない）
  assert.ok(!fs.lstatSync(path.join(target, "node_modules")).isSymbolicLink());
  fs.writeFileSync(path.join(target, "node_modules", "pkg", "index.js"), "changed");
  assert.equal(fs.readFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "utf8"), "module.exports = 1;");
});

test("addWorktree: Git で無視していない node_modules は写さない", async () => {
  const { root, repo } = repoWith(false);
  await addWorktree(repo, "feat/y");
  assert.ok(!fs.existsSync(path.join(root, "app-worktrees", "feat-y", "node_modules")));
});
