import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { evaluateReferenceWrite } from "./scope.js";

test("参照資料への書き込みは、どの権限モードでも拒否する", () => {
  const ref = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-ref-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-repo-"));
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: path.join(ref, "a.md") }).decision, "deny");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Edit", { file_path: path.join(repo, "src/a.ts") }).decision, "pass");
  assert.equal(evaluateReferenceWrite(repo, [ref], "Read", { file_path: path.join(ref, "a.md") }).decision, "pass");
  assert.equal(evaluateReferenceWrite(repo, [], "Write", { file_path: path.join(ref, "a.md") }).decision, "pass");
});

test("参照資料の中を指すシンボリックリンクを通した書き込みも拒否する", () => {
  const ref = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-ref-")));
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-repo-")));
  fs.symlinkSync(ref, path.join(repo, "link"));
  assert.equal(evaluateReferenceWrite(repo, [ref], "Write", { file_path: "link/a.md" }).decision, "deny");
});
