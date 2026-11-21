import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { evaluateReferenceWrite, evaluateUntrackedWrite, resolveCallPaths } from "./scope";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("参照資料への書き込みは、どの権限モードでも拒否する", () => {
  const ref = tempDir();
  const repo = tempDir();
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: path.join(ref, "a.md") }).kind, "deny");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Edit", { file_path: path.join(repo, "src/a.ts") }).kind, "pass");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Read", { file_path: path.join(ref, "a.md") }).kind, "pass");
  assert.equal(evaluateReferenceWrite(repo, [], "Write", { file_path: path.join(ref, "a.md") }).kind, "pass");
});

test("参照資料の中を指すシンボリックリンクを通した書き込みも拒否する", () => {
  const ref = tempDir({ real: true });
  const repo = tempDir({ real: true });
  fs.symlinkSync(ref, path.join(repo, "link"));
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: "link/a.md" }).kind, "deny");
});

test("Git で管理していないファイルだけを書けるチャット: 管理しているファイル・作業場所の外・.git は断り、無視しているファイル・まだないファイルは通す", async () => {
  const repo = tempDir({ real: true });
  gitRepo({ dir: repo, files: { "compose.yaml": "services: {}\n", ".gitignore": ".env\n.kickoff/\n" } });
  fs.writeFileSync(path.join(repo, ".env"), "PORT=3000\n");
  const decide = (tool: string, input: Record<string, unknown>) => evaluateUntrackedWrite(repo, tool, input).then((r) => r.kind);
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

test("resolveCallPaths: ツールのパスの欄だけを作業フォルダ（~ はホーム）で解いた絶対パスにし、ほかの欄・パスのないツールは変えない", () => {
  const call = (name: string, input: Record<string, unknown>) => resolveCallPaths({ name, input, cwd: "/w" }).input;
  assert.deepEqual(call("Write", { file_path: "a/../b.ts", content: "x" }), { file_path: "/w/b.ts", content: "x" });
  assert.deepEqual(call("NotebookEdit", { notebook_path: "n.ipynb" }), { notebook_path: "/w/n.ipynb" });
  assert.deepEqual(call("Grep", { pattern: "x", path: "~/src" }), { pattern: "x", path: path.join(os.homedir(), "src") });
  assert.deepEqual(call("Read", { file_path: "/abs/a.ts" }), { file_path: "/abs/a.ts" });
  assert.deepEqual(call("Bash", { command: "cat a" }), { command: "cat a" });
  assert.deepEqual(call("Read", { file_path: "" }), { file_path: "" });
  assert.deepEqual(call("Unknown", { file_path: "a" }), { file_path: "a" });
});
