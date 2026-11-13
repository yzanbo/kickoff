import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { evaluateReferenceWrite, evaluateUntrackedWrite } from "./scope.js";
import { gitRepo } from "../../testing/gitRepo.js";
import { tempDir } from "../../testing/tempDir.js";

test("参照資料への書き込みは、どの権限モードでも拒否する", () => {
  const ref = tempDir();
  const repo = tempDir();
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: path.join(ref, "a.md") }).decision, "deny");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Edit", { file_path: path.join(repo, "src/a.ts") }).decision, "pass");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Read", { file_path: path.join(ref, "a.md") }).decision, "pass");
  assert.equal(evaluateReferenceWrite(repo, [], "Write", { file_path: path.join(ref, "a.md") }).decision, "pass");
});

test("参照資料の中を指すシンボリックリンクを通した書き込みも拒否する", () => {
  const ref = tempDir({ real: true });
  const repo = tempDir({ real: true });
  fs.symlinkSync(ref, path.join(repo, "link"));
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: "link/a.md" }).decision, "deny");
});

test("Git で管理していないファイルだけを書けるチャット: 管理しているファイル・作業場所の外・.git は断り、無視しているファイル・まだないファイルは通す", async () => {
  const repo = tempDir({ real: true });
  gitRepo({ dir: repo, files: { "compose.yaml": "services: {}\n", ".gitignore": ".env\n.kickoff/\n" } });
  fs.writeFileSync(path.join(repo, ".env"), "PORT=3000\n");
  const decide = (tool: string, input: Record<string, unknown>) => evaluateUntrackedWrite(repo, tool, input).then((r) => r.decision);
  assert.equal(await decide("Edit", { file_path: path.join(repo, ".env") }), "pass");
  assert.equal(await decide("Write", { file_path: ".kickoff/compose.worktree.yaml" }), "pass");
  assert.equal(await decide("Write", { file_path: path.join(repo, "new-untracked.txt") }), "pass");
  assert.equal(await decide("Edit", { file_path: path.join(repo, "compose.yaml") }), "deny");
  assert.equal(await decide("MultiEdit", { file_path: "compose.yaml" }), "deny");
  assert.equal(await decide("Write", { file_path: path.join(repo, ".git", "config") }), "deny");
  assert.equal(await decide("Write", { file_path: path.join(tempDir(), "a.txt") }), "deny");
  assert.equal(await decide("Read", { file_path: path.join(repo, "compose.yaml") }), "pass");
  // Bash: Git の中身を変える git のコマンドだけ断る
  assert.equal(await decide("Bash", { command: "git status && docker compose config" }), "pass");
  assert.equal(await decide("Bash", { command: "git diff -- compose.yaml" }), "pass");
  assert.equal(await decide("Bash", { command: "git add compose.yaml && git commit -m x" }), "deny");
  assert.equal(await decide("Bash", { command: "cd sub; git -C .. checkout -- compose.yaml" }), "deny");
  assert.equal(await decide("Bash", { command: "git stash" }), "deny");
});
