import assert from "node:assert/strict";
import { test } from "node:test";
import type { CiJob, CiRun } from "@shared/types";
import { ciCaptureName, ciFailedDocument, ciLinkOf, ciLogLine, ciSelectedText, hasPending, jobToOpen, parseCiSelected, stepsWithLogs, stepToOpen } from "./ciView";

const run = (patch: Partial<CiRun> = {}): CiRun => ({
  id: 9,
  workflow: "CI",
  number: 12,
  attempt: 1,
  title: "テストを足す",
  branch: "fix-z",
  event: "push",
  sha: "abcdef1234567",
  state: "failure",
  url: "https://github.com/o/r/actions/runs/9",
  pulls: [],
  actor: "me",
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:01:00Z",
  ...patch,
});

const job = (id: number, state: CiJob["state"], steps: CiJob["steps"] = []): CiJob => ({ id, name: `job${id}`, state, started_at: null, completed_at: null, url: null, steps });

test("開いている実行: 実行だけ・ジョブも指す形を読み書きする（ほかは null）", () => {
  assert.deepEqual(parseCiSelected("43377548818"), { runId: 43377548818, jobId: null });
  assert.deepEqual(parseCiSelected(ciSelectedText(5, 7)), { runId: 5, jobId: 7 });
  assert.equal(parseCiSelected(""), null);
  assert.equal(parseCiSelected("pr:5"), null);
});

test("自動で取り直すのは、動いている実行か外の CI があるときだけ", () => {
  const list = { runs: [run()], external: [], default_branch: "main", workplace_branches: [], fetched_at: "" };
  assert.equal(hasPending(list), false);
  assert.equal(hasPending({ ...list, runs: [run({ state: "pending" })] }), true);
  assert.equal(hasPending({ ...list, external: [{ name: "vercel", branch: "main", sha: "a", state: "pending", description: null, url: null, updated_at: null }] }), true);
  assert.equal(hasPending(null), false);
});

test("初めに開くジョブとステップ: 指したもの → 落ちたもの → 動いているもの", () => {
  const jobs = [job(1, "success"), job(2, "pending"), job(3, "failure", [{ number: 1, name: "Prepare", state: "success" }, { number: 2, name: "Test", state: "failure" }])];
  assert.equal(jobToOpen(jobs, null)?.id, 3);
  assert.equal(jobToOpen(jobs, 1)?.id, 1);
  assert.equal(jobToOpen([job(1, "success"), job(2, "pending")], null)?.id, 2);
  assert.equal(jobToOpen([job(1, "success")], null), null);
  assert.equal(stepToOpen(jobs[2]), "Test");
  assert.equal(stepToOpen(jobs[0]), null);
});

test("札の中身: 実行の様子と落ちたステップのログ。ログの ``` で囲みが切れない", () => {
  const doc = ciFailedDocument({ run: run({ pulls: [5] }), steps: [{ job: "test", step: "Test", lines: ["FAIL a.test", "```js", "x"] }] });
  assert.match(doc, /^# CI の失敗ログ: CI #12/);
  assert.match(doc, /- ブランチ: fix-z/);
  assert.match(doc, /- コミット: abcdef1/);
  assert.match(doc, /- PR: #5/);
  assert.match(doc, /## test \/ Test\n\n````text\nFAIL a.test\n```js\nx\n````/);
  assert.match(ciFailedDocument({ run: run(), steps: [] }), /取れませんでした/);
});

test("札の名前と結び付ける PR", () => {
  assert.equal(ciCaptureName(run({ workflow: "Build & Test" })), "ci-Build-Test-12-failed.md");
  assert.deepEqual(ciLinkOf(run({ pulls: [5, 6] }), "o/r"), { repo: "o/r", kind: "pr", number: 5 });
  assert.equal(ciLinkOf(run(), "o/r"), undefined);
});

test("ログの行: ##[group] は見出し、##[error] は赤、##[endgroup] は出さない", () => {
  assert.deepEqual(ciLogLine("##[group]Run npm test"), { kind: "group", text: "Run npm test" });
  assert.deepEqual(ciLogLine("##[error]Process completed with exit code 1."), { kind: "error", text: "Process completed with exit code 1." });
  assert.deepEqual(ciLogLine("##[endgroup]"), { kind: "hidden" });
  assert.deepEqual(ciLogLine("##[debug]x"), { kind: "line", text: "x" });
  assert.deepEqual(ciLogLine("ok 1"), { kind: "line", text: "ok 1" });
});

test("ステップとログ: 名前で前から順に当て、当たらないログは後ろに足す", () => {
  const rows = stepsWithLogs([{ name: "Set up job" }, { name: "Run" }, { name: "Run" }, { name: "Skip" }], [{ name: "Run", n: 1 }, { name: "Set up job", n: 0 }, { name: "Run", n: 2 }, { name: "Extra", n: 3 }]);
  assert.deepEqual(rows.map((r) => [r.name, r.log?.n ?? null, r.step !== null]), [["Set up job", 0, true], ["Run", 1, true], ["Run", 2, true], ["Skip", null, true], ["Extra", 3, false]]);
});
