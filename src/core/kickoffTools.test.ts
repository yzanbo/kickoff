import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKickoffTools, exportToRepo } from "./kickoffTools.js";
import { phasePolicy } from "./phases.js";
import { toAllowedTools } from "./providers/claude.js";
import { Store } from "./store.js";

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-test-"));
}

test("exportToRepo はリポジトリ内に書き出し、外へのパスは拒否する", async () => {
  const repo = tmpRepo();
  assert.equal(await exportToRepo(repo, "docs/requirements.md", "# 要件"), path.join("docs", "requirements.md"));
  assert.equal(fs.readFileSync(path.join(repo, "docs/requirements.md"), "utf8"), "# 要件\n");
  await assert.rejects(exportToRepo(repo, "../escape.md", "x"));
  await assert.rejects(exportToRepo(repo, "/etc/passwd", "x"));
});

test("AI のツールは他プロジェクトのタスクに触れられない", async () => {
  const store = new Store(":memory:");
  const mine = store.createProject({ name: "a", repo_path: tmpRepo(), provider: "claude" });
  const other = store.createProject({ name: "b", repo_path: tmpRepo(), provider: "claude" });
  const foreign = store.createTask({ project_id: other.id, phase: "implementation", title: "他人のタスク" });

  const tools = createKickoffTools({ store, projectId: mine.id, runId: 1, taskId: null, phase: "requirements" });
  const update = tools.find((t) => t.name === "update_task")!;
  await assert.rejects(update.handler({ task_id: foreign.id, status: "done" }));

  const create = tools.find((t) => t.name === "create_task")!;
  await create.handler({ phase: "implementation", title: "ログイン画面", description: "メールでログイン" });
  const created = store.listTasks(mine.id);
  assert.equal(created.length, 1);
  assert.equal(created[0].created_by, "agent");
});

test("フェーズの権限が Claude の許可ルールに変換される", () => {
  const store = new Store(":memory:");
  const project = store.createProject({
    name: "a",
    repo_path: "/tmp/a",
    provider: "claude",
    test_command: "npm run e2e",
  });
  const tools = createKickoffTools({ store, projectId: project.id, runId: 1, taskId: null, phase: "implementation" });

  const impl = toAllowedTools(phasePolicy("implementation", project), tools);
  assert.ok(impl.includes("Edit"));
  assert.ok(impl.includes("Bash(git commit:*)"));
  assert.ok(impl.includes("Bash(npm run e2e:*)"));
  assert.ok(impl.includes("mcp__kickoff__create_task"));

  // デプロイは編集もコミットも自動許可しない
  const deploy = toAllowedTools(phasePolicy("deployment", project), tools);
  assert.ok(!deploy.includes("Edit"));
  assert.ok(!deploy.some((r) => r.startsWith("Bash(git commit")));
});
