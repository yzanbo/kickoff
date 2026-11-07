import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createWorkspace, initGitRepo, inspectWorkspace, prepareImportedWorkspace, toFolderName } from "./workspace.js";
import { gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

test("フォルダ名は安全な文字だけにする", () => {
  assert.equal(toFolderName("My Todo App"), "my-todo-app");
  assert.equal(toFolderName("家計簿アプリ"), "");
  assert.equal(toFolderName("../evil"), "evil");
});

test("新規プロジェクトのフォルダを git リポジトリとして初期化し、最初のコミットを作る", async () => {
  const parent = tempDir();
  const repo = await createWorkspace({ parentDir: parent, folderName: "todo", name: "Todo", description: "やることを管理したい" });

  assert.equal(repo, fs.realpathSync(path.join(parent, "todo")));
  assert.match(fs.readFileSync(path.join(repo, "README.md"), "utf8"), /やることを管理したい/);
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(branch, "main");
  const log = execFileSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(log.split("\n").length, 1);
});

test("空でない既存フォルダには作らない", async () => {
  const parent = tempDir();
  fs.mkdirSync(path.join(parent, "taken"));
  fs.writeFileSync(path.join(parent, "taken", "x.txt"), "x");
  await assert.rejects(createWorkspace({ parentDir: parent, folderName: "taken", name: "x", description: "" }), /空ではありません/);
});

test("git 未管理のフォルダは、同意がなければそのまま（git で管理しないプロジェクト）、同意すれば初期化して既存ファイルをコミットする", async () => {
  const dir = tempDir({ real: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>hi</h1>");

  const before = await inspectWorkspace(dir);
  assert.equal(before.is_git, false);
  assert.equal(await prepareImportedWorkspace(dir, false), dir);
  assert.equal((await inspectWorkspace(dir)).is_git, false);

  assert.equal(await prepareImportedWorkspace(dir, true), dir);
  const after = await inspectWorkspace(dir);
  assert.equal(after.is_git, true);
  assert.equal(after.has_commits, true);
  assert.equal(after.dirty, false);
});

test("コミット済みのリポジトリはそのまま取り込む。リポジトリの中のフォルダも、初期化せずにそのまま取り込む", async () => {
  // 以前はここで Git の名前を渡さずにコミットしていて、名前を設定していない環境では落ちた（gitRepo が渡す）
  const { dir } = gitRepo({ dir: tempDir({ real: true }), files: { "src/a.ts": "export {}" } });
  fs.writeFileSync(path.join(dir, "wip.txt"), "作業中");

  // シンボリックリンク経由（/tmp → /private/tmp）でもルートとして認識する
  const viaLink = path.join(os.tmpdir(), path.relative(fs.realpathSync(os.tmpdir()), dir));
  const info = await inspectWorkspace(viaLink);
  assert.equal(info.git_root, info.path);
  assert.equal(info.dirty, true);
  assert.equal(info.branch, "main");
  assert.equal(await prepareImportedWorkspace(dir, false), dir);
  // 未コミットの変更には手を付けない
  assert.equal(fs.existsSync(path.join(dir, "wip.txt")), true);
  assert.equal((await inspectWorkspace(dir)).dirty, true);

  // 中のフォルダは選んだまま（initGit でも、中にリポジトリを作らない）。未コミットの判定はそのフォルダの中だけ
  assert.equal(await prepareImportedWorkspace(path.join(dir, "src"), true), path.join(dir, "src"));
  assert.equal(fs.existsSync(path.join(dir, "src", ".git")), false);
  const inner = await inspectWorkspace(path.join(dir, "src"));
  assert.equal(inner.git_root, dir);
  assert.equal(inner.dirty, false);
  assert.equal(inner.empty, false);
});

test("保存先がリポジトリの中なら、新しいプロジェクトに git の管理を始めず、親のリポジトリの中のフォルダにする", async () => {
  const { dir } = gitRepo({ dir: tempDir({ real: true }), files: { "a.txt": "a" } });
  const repo = await createWorkspace({ parentDir: dir, folderName: "child", name: "Child", description: "" });
  assert.equal(fs.existsSync(path.join(repo, ".git")), false);
  assert.equal((await inspectWorkspace(repo)).git_root, dir);
  const empty = tempDir({ real: true });
  fs.writeFileSync(path.join(empty, ".DS_Store"), "");
  assert.equal((await inspectWorkspace(empty)).empty, true);
});

test("新しいプロジェクトは git で管理しないこともできる（README だけ）。あとから initGitRepo で始め、二度目は断る", async () => {
  const parent = tempDir({ real: true });
  const repo = await createWorkspace({ parentDir: parent, folderName: "plain", name: "Plain", description: "", initGit: false });
  assert.equal(fs.existsSync(path.join(repo, "README.md")), true);
  assert.equal((await inspectWorkspace(repo)).is_git, false);
  await initGitRepo(repo);
  const info = await inspectWorkspace(repo);
  assert.deepEqual([info.is_git, info.has_commits, info.dirty], [true, true, false]);
  await assert.rejects(initGitRepo(repo), /もう git/);
  // ほかのリポジトリの中のフォルダは始めない
  fs.mkdirSync(path.join(repo, "sub"));
  await assert.rejects(initGitRepo(path.join(repo, "sub")), /中にあります/);
});
