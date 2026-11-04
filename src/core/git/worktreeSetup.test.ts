import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addWorktree } from "./index.js";

function repoWith(ignoreNodeModules: boolean) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-wt-")));
  const repo = path.join(root, "app");
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "module.exports = 1;");
  if (ignoreNodeModules) fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  else fs.writeFileSync(path.join(repo, "README.md"), "app\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "add", ignoreNodeModules ? ".gitignore" : "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "init");
  return { root, repo };
}

test("addWorktree: 本体の node_modules（Git で無視しているもの）を、新しいワークツリーに写す", async () => {
  const { root, repo } = repoWith(true);
  await addWorktree(repo, "feat/x");
  const target = path.join(root, "app-worktrees", "feat-x");
  assert.equal(fs.readFileSync(path.join(target, "node_modules", "pkg", "index.js"), "utf8"), "module.exports = 1;");
  // 本物のフォルダとして写す（ワークツリーで書き換えても本体は変わらない）
  assert.ok(!fs.lstatSync(path.join(target, "node_modules")).isSymbolicLink());
  fs.writeFileSync(path.join(target, "node_modules", "pkg", "index.js"), "changed");
  assert.equal(fs.readFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "utf8"), "module.exports = 1;");
  fs.rmSync(root, { recursive: true, force: true });
});

test("addWorktree: Git で無視していない node_modules は写さない", async () => {
  const { root, repo } = repoWith(false);
  await addWorktree(repo, "feat/y");
  assert.ok(!fs.existsSync(path.join(root, "app-worktrees", "feat-y", "node_modules")));
  fs.rmSync(root, { recursive: true, force: true });
});
