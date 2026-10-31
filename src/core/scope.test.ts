import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKickoffTools } from "./kickoffTools.js";
import { phasePolicy } from "./phases.js";
import { evaluateScopedToolUse, isReadOnlyCommand, normalizeScope } from "./scope.js";
import { Store } from "./store.js";

const repo = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-scope-")));

test("指定フォルダは相対パスに正規化し、リポジトリの外は拒否する", () => {
  const r = repo();
  assert.equal(normalizeScope(r, "docs/"), "docs");
  assert.equal(normalizeScope(r, path.join(r, "docs", "specs")), "docs/specs");
  assert.equal(normalizeScope(r, "."), ".");
  assert.throws(() => normalizeScope(r, "../other"), /外/);
  assert.throws(() => normalizeScope(r, "/etc"), /外/);
});

test("範囲内の編集は許可、範囲外とパスの抜け道は拒否する", () => {
  const r = repo();
  const allow = (tool: string, input: Record<string, unknown>) => evaluateScopedToolUse(r, ["docs"], tool, input).decision;
  assert.equal(allow("Write", { file_path: "docs/requirements.md" }), "allow");
  assert.equal(allow("Edit", { file_path: path.join(r, "docs", "a", "b.md") }), "allow");
  assert.equal(allow("Write", { file_path: "src/index.ts" }), "deny");
  assert.equal(allow("Write", { file_path: "docs/../src/index.ts" }), "deny");
  assert.equal(allow("Write", { file_path: "docs-evil/x.md" }), "deny");
  assert.equal(allow("NotebookEdit", { notebook_path: "notes.ipynb" }), "deny");
  // 書き込み以外のツールは通常の判定に任せる
  assert.equal(allow("Read", { file_path: "src/index.ts" }), "pass");
});

test("シンボリックリンクで範囲外に出る書き込みも拒否する", () => {
  const r = repo();
  const outside = repo();
  fs.mkdirSync(path.join(r, "docs"));
  fs.symlinkSync(outside, path.join(r, "docs", "link"));
  assert.equal(evaluateScopedToolUse(r, ["docs"], "Write", { file_path: "docs/link/x.md" }).decision, "deny");
});

test("シェルは読み取り専用のコマンドだけ通す", () => {
  assert.ok(isReadOnlyCommand("git status --short"));
  assert.ok(isReadOnlyCommand("git log --oneline | head -5"));
  assert.ok(isReadOnlyCommand("ls -la docs"));
  assert.ok(!isReadOnlyCommand("rm -rf src"));
  assert.ok(!isReadOnlyCommand("cat a > b"));
  assert.ok(!isReadOnlyCommand("ls; rm -rf ."));
  assert.ok(!isReadOnlyCommand("ls && touch x"));
  assert.ok(!isReadOnlyCommand("cat $(whoami)"));
  assert.ok(!isReadOnlyCommand("git log | sh"));
  assert.ok(!isReadOnlyCommand("lsof"));
});

test("要件定義・スケジュールには既定で docs が設定され、プロジェクトごとに変えられる", async () => {
  const store = new Store(":memory:");
  const r = repo();
  const project = store.createProject({ name: "p", repo_path: r, provider: "claude" });
  assert.deepEqual(phasePolicy("requirements", project).writeScope, ["docs"]);
  assert.equal(phasePolicy("implementation", project).writeScope, undefined);

  const updated = store.updateProject(project.id, { write_scopes: { schedule: ["planning"] } });
  assert.deepEqual(phasePolicy("schedule", updated).writeScope, ["planning"]);
  assert.deepEqual(phasePolicy("requirements", updated).writeScope, ["docs"]);

  // 成果物の書き出し先も範囲で制限する
  const run = store.createRun({ project_id: project.id, task_id: null, phase: "schedule", provider: "claude", title: "s", status: "running", model: null });
  const tools = createKickoffTools({ store, projectId: project.id, runId: run.id, taskId: null, phase: "schedule", writeScope: ["planning"] });
  const save = tools.find((t) => t.name === "save_artifact")!;
  await assert.rejects(save.handler({ kind: "schedule", title: "s", content: "x", export_path: "docs/schedule.md" }), /planning/);
  await save.handler({ kind: "schedule", title: "s", content: "x", export_path: "planning/schedule.md" });
  assert.ok(fs.existsSync(path.join(r, "planning", "schedule.md")));
});
