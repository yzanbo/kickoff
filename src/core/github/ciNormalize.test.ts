import assert from "node:assert/strict";
import { test } from "node:test";
import type { CiRun } from "@shared/types";
import { ciStateOf, failuresToNotify, parseRunLog, stepLogsOf, stripAnsi, toCiJob, toCiRun, toExternalChecks } from "./ciNormalize.js";

test("ciStateOf: 終わっていなければ実行中、終わっていれば conclusion から（時間切れ・起動の失敗も落ちた）", () => {
  assert.equal(ciStateOf("in_progress", null), "pending");
  assert.equal(ciStateOf("queued", null), "pending");
  assert.equal(ciStateOf("completed", "success"), "success");
  assert.equal(ciStateOf("completed", "timed_out"), "failure");
  assert.equal(ciStateOf("completed", "startup_failure"), "failure");
  assert.equal(ciStateOf("completed", "cancelled"), "cancelled");
  assert.equal(ciStateOf("completed", "skipped"), "skipped");
  assert.equal(ciStateOf("completed", "stale"), "neutral");
});

test("toCiRun: REST の workflow run を、題・ブランチ・PR の番号・状態にする", () => {
  const run = toCiRun({
    id: 7,
    name: "CI",
    run_number: 482,
    run_attempt: 2,
    display_title: "落ちる CI",
    head_branch: "main",
    event: "push",
    head_sha: "abc",
    status: "completed",
    conclusion: "failure",
    html_url: "https://github.com/o/r/actions/runs/7",
    pull_requests: [{ number: 12 }],
    actor: { login: "me" },
    created_at: "2026-11-13T06:16:20Z",
    updated_at: "2026-11-13T06:16:40Z",
  });
  assert.deepEqual(run, {
    id: 7,
    workflow: "CI",
    number: 482,
    attempt: 2,
    title: "落ちる CI",
    branch: "main",
    event: "push",
    sha: "abc",
    state: "failure",
    url: "https://github.com/o/r/actions/runs/7",
    pulls: [12],
    actor: "me",
    created_at: "2026-11-13T06:16:20Z",
    updated_at: "2026-11-13T06:16:40Z",
  });
  // 題がなければコミットのメッセージの 1 行目、ブランチがなければ null
  const bare = toCiRun({ id: 8, head_commit: { message: "1 行目\n2 行目" }, status: "in_progress" });
  assert.equal(bare.title, "1 行目");
  assert.equal(bare.branch, null);
  assert.equal(bare.state, "pending");
});

test("toCiJob: ステップは番号の順に並べ、状態を付ける", () => {
  const job = toCiJob({
    id: 3,
    name: "test",
    status: "completed",
    conclusion: "failure",
    steps: [
      { number: 4, name: "Test", status: "completed", conclusion: "failure" },
      { number: 1, name: "Set up job", status: "completed", conclusion: "success" },
      { number: 5, name: "After", status: "completed", conclusion: "skipped" },
    ],
  });
  assert.deepEqual(
    job.steps.map((s) => [s.number, s.name, s.state]),
    [
      [1, "Set up job", "success"],
      [4, "Test", "failure"],
      [5, "After", "skipped"],
    ],
  );
  assert.equal(job.state, "failure");
});

test("toExternalChecks: commit status と、GitHub Actions でない check run だけを並べる", () => {
  const list = toExternalChecks(
    "main",
    { sha: "abc", statuses: [{ context: "vercel", state: "error", description: "落ちた", target_url: "https://vercel.example/1", updated_at: "t" }] },
    {
      check_runs: [
        { name: "test", app: { slug: "github-actions" }, status: "completed", conclusion: "failure", head_sha: "abc" },
        { name: "circleci", app: { slug: "circleci-checks" }, status: "completed", conclusion: "success", head_sha: "abc", details_url: "https://circleci.example/2" },
      ],
    },
  );
  assert.deepEqual(
    list.map((c) => [c.name, c.state, c.url]),
    [
      ["vercel", "failure", "https://vercel.example/1"],
      ["circleci", "success", "https://circleci.example/2"],
    ],
  );
  assert.ok(list.every((c) => c.branch === "main" && c.sha === "abc"));
});

const LOG = [
  "test\tSet up job\t﻿2026-11-13T06:16:27.7194827Z Current runner version: '2.338.2'",
  "test\tSet up job\t2026-11-13T06:16:27.7227272Z ##[group]Runner Image Provisioner",
  "test\tTest\t2026-11-13T06:16:29.4861657Z ##[group]Run echo \"running tests\"",
  "test\tTest\t2026-11-13T06:16:29.4981033Z FAIL src/foo.test.ts",
  "test\tTest\t2026-11-13T06:16:29.4995900Z \u001b[31m##[error]Process completed with exit code 1.\u001b[0m",
  "lint\tLint\t2026-11-13T06:16:28.0000000Z lint ok",
  "",
].join("\n");

test("parseRunLog: ジョブ・ステップごとに分け、行の頭の時刻（BOM 付きも）を外す", () => {
  assert.deepEqual(parseRunLog(LOG), [
    { job: "test", step: "Set up job", lines: ["Current runner version: '2.338.2'", "##[group]Runner Image Provisioner"] },
    { job: "test", step: "Test", lines: ['##[group]Run echo "running tests"', "FAIL src/foo.test.ts", "\u001b[31m##[error]Process completed with exit code 1.\u001b[0m"] },
    { job: "lint", step: "Lint", lines: ["lint ok"] },
  ]);
});

test("stepLogsOf: 1 つのジョブのログをステップごとにまとめる（離れて出た同じステップも 1 つに）", () => {
  const text = ["j\tA\t2026-01-01T00:00:00Z a1", "j\tB\t2026-01-01T00:00:01Z b1", "j\tA\t2026-01-01T00:00:02Z a2"].join("\n");
  assert.deepEqual(stepLogsOf(text), [
    { name: "A", lines: ["a1", "a2"] },
    { name: "B", lines: ["b1"] },
  ]);
});

test("stripAnsi: 色の制御文字を外す", () => {
  assert.equal(stripAnsi("\u001b[36;1mecho\u001b[0m ok"), "echo ok");
});

const run = (id: number, branch: string, state: CiRun["state"], created: string, workflow = "CI"): CiRun => ({
  id,
  workflow,
  number: id,
  attempt: 1,
  title: "",
  branch,
  event: "push",
  sha: "",
  state,
  url: "",
  pulls: [],
  actor: null,
  created_at: created,
  updated_at: created,
});

test("failuresToNotify: 見張るブランチのワークフローごとの最新が落ちていて、まだ知らせていない・新しいものだけ", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const day = 24 * 3600_000;
  const runs = [
    run(1, "main", "failure", "2026-11-13T10:00:00Z"),
    // main は最新が通ったので知らせない
    run(2, "main", "success", "2026-11-13T11:00:00Z"),
    run(3, "feat-x", "failure", "2026-11-13T11:00:00Z"),
    // 同じブランチでも別のワークフローは別に見る
    run(4, "feat-x", "failure", "2026-11-13T11:30:00Z", "Lint"),
    // 見張っていないブランチ（他人のブランチ）
    run(5, "someone", "failure", "2026-11-13T11:00:00Z"),
    // 古すぎる
    run(6, "old", "failure", "2026-11-10T11:00:00Z"),
    // 動いている最中
    run(7, "wip", "pending", "2026-11-13T11:00:00Z"),
  ];
  const branches = new Set(["main", "feat-x", "old", "wip"]);
  assert.deepEqual(
    failuresToNotify(runs, branches, new Set(), now, day).map((r) => r.id),
    [3, 4],
  );
  // 知らせたものは知らせ直さない
  assert.deepEqual(
    failuresToNotify(runs, branches, new Set([3]), now, day).map((r) => r.id),
    [4],
  );
});

test("parseRunLog: gh が「^[」と書いた色の印は ESC に戻し、stripAnsi で外せる", () => {
  const [part] = parseRunLog("test\tTest\t2026-11-13T00:00:00.0000000Z ^[[36;1mecho hi^[[0m\n");
  assert.equal(part.lines[0], "\u001b[36;1mecho hi\u001b[0m");
  assert.equal(stripAnsi(part.lines[0]), "echo hi");
});
