import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createWorkspace, toFolderName } from "./workspace.js";

test("フォルダ名は安全な文字だけにする", () => {
  assert.equal(toFolderName("My Todo App"), "my-todo-app");
  assert.equal(toFolderName("家計簿アプリ"), "");
  assert.equal(toFolderName("../evil"), "evil");
});

test("新規プロジェクトのフォルダを git リポジトリとして初期化し、最初のコミットを作る", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-ws-"));
  const repo = await createWorkspace({ parentDir: parent, folderName: "todo", name: "Todo", idea: "やることを管理したい" });

  assert.equal(repo, path.join(parent, "todo"));
  assert.match(fs.readFileSync(path.join(repo, "README.md"), "utf8"), /やることを管理したい/);
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(branch, "main");
  const log = execFileSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" }).trim();
  assert.equal(log.split("\n").length, 1);
});

test("空でない既存フォルダには作らない", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-ws-"));
  fs.mkdirSync(path.join(parent, "taken"));
  fs.writeFileSync(path.join(parent, "taken", "x.txt"), "x");
  await assert.rejects(createWorkspace({ parentDir: parent, folderName: "taken", name: "x", idea: "" }), /空ではありません/);
});
