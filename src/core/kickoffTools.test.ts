import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKickoffTools, exportToRepo } from "./kickoffTools.js";
import { buildSystemPrompt, phasePolicy } from "./phases.js";
import { toAllowedTools } from "./providers/claudePolicy.js";
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

test("ワークツリーのチャット: 成果物は作業場所に書き出し、指示の「リポジトリ」も作業場所にする（本体は場所だけ添える）", async () => {
  const store = new Store(":memory:");
  const repo = tmpRepo();
  const worktree = tmpRepo();
  const project = store.createProject({ name: "a", repo_path: repo, provider: "claude" });
  const run = store.createRun({ project_id: project.id, task_id: null, phase: "requirements", provider: "claude", title: "x", status: "completed", model: null });
  const tools = createKickoffTools({ store, projectId: project.id, runId: run.id, taskId: null, phase: "requirements", workdir: worktree });
  const save = tools.find((t) => t.name === "save_artifact")!;
  await save.handler({ kind: "requirements", title: "要件", content: "# 要件", export_path: "docs/requirements.md" });
  assert.ok(fs.existsSync(path.join(worktree, "docs/requirements.md")));
  assert.equal(fs.existsSync(path.join(repo, "docs/requirements.md")), false);

  const prompt = buildSystemPrompt(project, "requirements", null, worktree);
  assert.ok(prompt.includes(`- リポジトリ: ${worktree}`));
  assert.ok(prompt.includes(`- 本体のフォルダ: ${repo}`));
  // 本体で作業するチャットは、いままでどおり
  const main = buildSystemPrompt(project, "requirements", null);
  assert.ok(main.includes(`- リポジトリ: ${repo}`));
  assert.ok(!main.includes("本体のフォルダ"));
});
