// API のテスト: CI の結果（実行の一覧と外の CI・中身・ジョブのログ・失敗したステップのログ・やり直し・直すチャットの作業場所・失敗の見張り。GitHub の答えは testServer の ghFake）
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { BusEvent, CiFailedLog, CiJobLog, CiRunDetail, CiRunList, CiRunWorktree } from "@shared/types";
import { Invalid } from "./errors.js";
import { setup, TOKEN } from "../testing/testServer.js";
import { gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

const NOW = new Date().toISOString();
const rawRun = (id: number, branch: string, conclusion: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  name: "CI",
  run_number: id,
  run_attempt: 1,
  display_title: `run ${id}`,
  head_branch: branch,
  head_sha: `sha${id}`,
  event: "push",
  status: conclusion ? "completed" : "in_progress",
  conclusion,
  html_url: `https://github.com/o/r/actions/runs/${id}`,
  pull_requests: [],
  created_at: NOW,
  updated_at: NOW,
  ...extra,
});

/** GitHub の REST の偽の答え（runs = 一覧の実行） */
function answer(runs: ReturnType<typeof rawRun>[]) {
  return (p: string) => {
    const body = (() => {
      if (p === "repos/o/r") return { default_branch: "main" };
      if (p.startsWith("repos/o/r/actions/runs?")) return { workflow_runs: runs };
      const run = /^repos\/o\/r\/actions\/runs\/(\d+)$/.exec(p);
      if (run) return runs.find((r) => r.id === Number(run[1])) ?? null;
      if (p === "repos/o/r/commits/main/status") return { sha: "sha1", statuses: [{ context: "vercel", state: "success", target_url: "https://vercel.example/1" }] };
      if (p.startsWith("repos/o/r/actions/runs/2/jobs"))
        return { total_count: 1, jobs: [{ id: 31, name: "test", status: "completed", conclusion: "failure", steps: [{ number: 1, name: "Test", status: "completed", conclusion: "failure" }] }] };
      if (p.startsWith("repos/o/r/commits/main/check-runs")) return { check_runs: [{ name: "test", app: { slug: "github-actions" }, status: "completed", conclusion: "failure" }] };
      return null;
    })();
    return { status: body ? 200 : 404, etag: null, body };
  };
}

/** 連携先の代わりの bare のリポジトリ（ブランチ fix）を clone したものをプロジェクトフォルダにする */
function cloneProject(repoPath: string) {
  const src = gitRepo({ files: { "a.txt": "a\n" } });
  src.git("branch", "fix");
  const bare = path.join(tempDir(), "o-r.git");
  execFileSync("git", ["clone", "-q", "--bare", src.dir, bare]);
  execFileSync("git", ["clone", "-q", bare, repoPath]);
  return bare;
}

test("CI: 実行の一覧と、既定のブランチの外の CI（GitHub Actions の check run は外に数えない）", async () => {
  const { call, project, ghFake } = setup();
  ghFake.rest = answer([rawRun(2, "main", "failure"), rawRun(1, "feat", "success")]);
  const list = (await call("GET", `/api/projects/${project.id}/ci/runs`)).body as CiRunList;
  assert.deepEqual(
    list.runs.map((r) => [r.id, r.branch, r.state]),
    [
      [2, "main", "failure"],
      [1, "feat", "success"],
    ],
  );
  assert.equal(list.default_branch, "main");
  assert.deepEqual(list.workplace_branches, []);
  assert.deepEqual(
    list.external.map((c) => [c.name, c.branch, c.state]),
    [["vercel", "main", "success"]],
  );
});

test("CI: 実行の中身とジョブのログ（ステップごと。動いている最中は出せない理由）", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/ci/runs/2`;
  ghFake.rest = answer([rawRun(2, "main", "failure")]);
  const detail = (await call("GET", base)).body as CiRunDetail;
  assert.equal(detail.run.id, 2);
  assert.deepEqual(detail.jobs[0].steps.map((s) => [s.name, s.state]), [["Test", "failure"]]);

  ghFake.cli = (args) => {
    assert.deepEqual(args, ["run", "view", "2", "--job", "31", "--log"]);
    return "test\tTest\t2026-11-13T06:16:29.0Z FAIL src/foo.test.ts\n";
  };
  const log = (await call("GET", `${base}/jobs/31/log`)).body as CiJobLog;
  assert.deepEqual(log, { job_id: 31, available: true, reason: null, steps: [{ name: "Test", lines: ["FAIL src/foo.test.ts"] }] });

  ghFake.cli = () => {
    throw new Invalid("GitHub に聞けませんでした: run 2 is still in progress; logs will be available when it is complete");
  };
  const busy = (await call("GET", `${base}/jobs/31/log`)).body as CiJobLog;
  assert.equal(busy.available, false);
  assert.match(busy.reason ?? "", /実行中/);
});

test("CI: 失敗したステップのログは落ちた実行だけ（色の制御文字は外す）", async () => {
  const { call, project, ghFake } = setup();
  ghFake.rest = answer([rawRun(2, "main", "failure"), rawRun(1, "feat", "success")]);
  ghFake.cli = (args) => {
    assert.deepEqual(args, ["run", "view", "2", "--log-failed"]);
    return "test\tTest\t2026-11-13T06:16:29.0Z \u001b[31m##[error]exit 1\u001b[0m\n";
  };
  const failed = (await call("GET", `/api/projects/${project.id}/ci/runs/2/failed-log`)).body as CiFailedLog;
  assert.deepEqual(failed.steps, [{ job: "test", step: "Test", lines: ["##[error]exit 1"] }]);
  assert.equal((await call("GET", `/api/projects/${project.id}/ci/runs/1/failed-log`)).status, 400);
});

test("CI: やり直し（失敗したジョブだけ / すべて）を REST で送る", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/ci/runs/2/rerun`;
  assert.equal((await call("POST", base, { failed: true })).status, 204);
  assert.equal((await call("POST", base, { failed: false })).status, 204);
  assert.deepEqual(
    ghFake.calls.filter((c) => c.kind === "send").map((c) => [c.method, c.detail]),
    [
      ["POST", "repos/o/r/actions/runs/2/rerun-failed-jobs"],
      ["POST", "repos/o/r/actions/runs/2/rerun"],
    ],
  );
  assert.equal((await call("POST", base, {})).status, 400);
});

test("CI: 「（ブランチ名）で直す」の作業場所（既定のブランチは本体、ほかはそのブランチのワークツリーを作り、2 回目はあるものを返す）", async () => {
  const { call, project, ghFake } = setup();
  ghFake.rest = answer([rawRun(2, "main", "failure"), rawRun(3, "fix", "failure", { head_repository: { full_name: "o/r" } })]);
  // Git でないフォルダは 400
  assert.equal((await call("POST", `/api/projects/${project.id}/ci/runs/3/worktree`)).status, 400);
  const bare = cloneProject(project.repo_path);
  ghFake.remotes = [{ name: "origin", host: "github.com", repo: "o/r", url: bare }];
  assert.deepEqual((await call("POST", `/api/projects/${project.id}/ci/runs/2/worktree`)).body, { worktree_path: null, branch: "main" } satisfies CiRunWorktree);
  const made = (await call("POST", `/api/projects/${project.id}/ci/runs/3/worktree`)).body as CiRunWorktree;
  assert.equal(made.branch, "fix");
  assert.ok(made.worktree_path && fs.existsSync(path.join(made.worktree_path, "a.txt")));
  assert.deepEqual((await call("POST", `/api/projects/${project.id}/ci/runs/3/worktree`)).body, made);
});

test("CI の失敗の見張り: 作業場所のブランチと既定のブランチの最新の失敗を 1 回だけ知らせる（他人のブランチ・見張らない設定は知らせない）", async () => {
  const { project, ghFake, prWatch, bus, store } = setup();
  cloneProject(project.repo_path);
  // 本体は main。他人のブランチ someone の失敗は知らせない
  ghFake.rest = answer([rawRun(5, "main", "failure"), rawRun(4, "someone", "failure")]);
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  await prWatch.checkAll();
  const failed = () => events.flatMap((e) => (e.type === "ci_failed" ? [e.failure] : []));
  assert.deepEqual(
    failed().map((f) => [f.run_id, f.branch]),
    [[5, "main"]],
  );
  // 同じ実行は知らせ直さない
  await prWatch.checkAll();
  assert.equal(failed().length, 1);
  // 見張らない設定にしたら、新しい失敗も知らせない
  store.projects.update(project.id, { ci_watch: false });
  ghFake.rest = answer([rawRun(6, "main", "failure")]);
  await prWatch.checkAll();
  assert.equal(failed().length, 1);
});

test("CI: この Mac からの頼みだけ受ける", async () => {
  const { app, project } = setup();
  const res = await app.request(`/api/projects/${project.id}/ci/runs`, { headers: { authorization: `Bearer ${TOKEN}` } }, { incoming: { socket: { remoteAddress: "192.168.1.5" } } });
  assert.equal(res.status, 403);
});
