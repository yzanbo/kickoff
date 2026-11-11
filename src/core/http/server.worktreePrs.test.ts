// API のテスト: ワークツリーの PR の知らせ（見張り・確認を閉じる・片付けたら消える。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import type { BusEvent, GitWorktree, Project, ProjectGitHub, WorktreePrNotice } from "@shared/types";
import { setup } from "../testing/testServer.js";
import { gitRepo } from "../testing/gitRepo.js";

const merged = (number: number, branch: string, state: "MERGED" | "CLOSED" | "OPEN" = "MERGED") => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  state,
  branch,
  head_owner: "o",
});

test("ワークツリーの PR の知らせ: ワークツリーがなければ GitHub に聞かない。マージ済みの PR は（前に開いているのを見ていなくても）知らせる", async () => {
  const { call, project, prFake, prWatch, bus } = setup();
  gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));

  await prWatch.checkAll();
  assert.equal(prFake.asked, 0);
  assert.deepEqual((await call("GET", "/api/worktree-prs")).body, []);

  const worktrees = (await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feat/x" })).body as GitWorktree[];
  const folder = worktrees.find((w) => w.branch === "feat/x")!.path;

  // 開いている PR だけなら知らせない
  prFake.prs = [merged(4, "feat/x", "OPEN")];
  await prWatch.checkAll();
  assert.equal(prFake.asked, 1);
  assert.deepEqual(prWatch.list(), []);

  prFake.prs = [merged(4, "feat/x")];
  await prWatch.checkAll();
  const notices = (await call("GET", "/api/worktree-prs")).body as WorktreePrNotice[];
  assert.deepEqual(notices, [
    { project_id: project.id, worktree: folder, branch: "feat/x", pr: { number: 4, title: "PR 4", url: "https://github.com/o/r/pull/4", state: "MERGED" }, dismissed: false },
  ]);
  assert.ok(events.some((e) => e.type === "worktree_prs" && e.project_id === project.id && e.notices.length === 1));

  // 窓に戻ったときの取り直しは、30 秒以内ならまとめる（GitHub に聞き直さない）
  await call("POST", "/api/worktree-prs/refresh");
  assert.equal(prFake.asked, 2);

  // gh が失敗しても、前の知らせのまま
  prFake.fail = true;
  await prWatch.checkAll();
  assert.equal(prWatch.list().length, 1);
  prFake.fail = false;
});

test("ワークツリーの PR の知らせ: 確認を閉じたら DB に覚えて出し直さない。ワークツリーを消したら、GitHub に聞かずに知らせと覚えが消える", async () => {
  const { call, project, store, prFake, prWatch, bus } = setup();
  gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const worktrees = (await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "fix/y" })).body as GitWorktree[];
  const folder = worktrees.find((w) => w.branch === "fix/y")!.path;
  prFake.prs = [merged(9, "fix/y", "CLOSED")];
  await prWatch.checkAll();
  assert.equal(prWatch.list()[0].dismissed, false);

  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  assert.equal((await call("POST", `/api/projects/${project.id}/worktree-prs/9/dismiss`)).status, 204);
  assert.equal(prWatch.list()[0].dismissed, true);
  assert.ok(events.some((e) => e.type === "worktree_prs" && e.notices[0]?.dismissed === true));
  assert.deepEqual([...store.prNotices.dismissed(project.id)], [9]);
  // 次に確かめても閉じたまま
  await prWatch.checkAll();
  assert.equal(prWatch.list()[0].dismissed, true);
  // 知らせのない PR は 404
  assert.equal((await call("POST", `/api/projects/${project.id}/worktree-prs/10/dismiss`)).status, 404);

  const asked = prFake.asked;
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: folder, delete_branch: true })).status, 200);
  assert.deepEqual(prWatch.list(), []);
  assert.equal(prFake.asked, asked);
  assert.ok(events.some((e) => e.type === "worktree_prs" && e.notices.length === 0));
  assert.deepEqual([...store.prNotices.dismissed(project.id)], []);
});

test("プロジェクトの GitHub の連携: 設定の「GitHub」にアカウント・GitHub の remote・自動の連携先を返し、見張りをオフにすると知らせが消えて GitHub に聞かない", async () => {
  const { call, project, prFake, prWatch } = setup();
  const dir = project.repo_path;
  gitRepo({ dir, files: { "a.txt": "a\n" } });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/me/r.git"], { cwd: dir });
  execFileSync("git", ["remote", "add", "upstream", "git@github.com:org/r.git"], { cwd: dir });
  execFileSync("git", ["remote", "add", "backup", "/tmp/elsewhere.git"], { cwd: dir });

  const github = (await call("GET", `/api/projects/${project.id}/github`)).body as ProjectGitHub;
  assert.deepEqual(github.accounts.map((a) => a.login), ["me", "work"]);
  assert.deepEqual(github.remotes.map((r) => r.name), ["origin", "upstream"]);
  assert.equal(github.auto_remote, "upstream");
  assert.equal(github.repo, "org/r");

  // 連携先とアカウントを選ぶ
  const patched = (await call("PATCH", `/api/projects/${project.id}`, { github_remote: "origin", github_account: "work" })).body as Project;
  assert.equal(patched.github_remote, "origin");
  assert.equal(patched.github_account, "work");
  assert.equal(((await call("GET", `/api/projects/${project.id}/github`)).body as ProjectGitHub).repo, "me/r");
  // 空の名前は断る・null で自動に戻す
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { github_remote: "" })).status, 400);
  assert.equal(((await call("PATCH", `/api/projects/${project.id}`, { github_remote: null, github_account: null })).body as Project).github_remote, null);

  // 見張り: マージ済みの PR を知らせたあと、オフにすると消え、聞き直さない
  await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feat/z" });
  prFake.prs = [merged(3, "feat/z")];
  await prWatch.checkAll();
  assert.equal(prWatch.list().length, 1);
  assert.equal(((await call("PATCH", `/api/projects/${project.id}`, { pr_watch: false })).body as Project).pr_watch, false);
  await prWatch.checkProject(project.id);
  assert.deepEqual(prWatch.list(), []);
  const asked = prFake.asked;
  await prWatch.checkAll();
  assert.equal(prFake.asked, asked);
  assert.deepEqual(prWatch.list(), []);
  // オンに戻すと、また知らせる
  await call("PATCH", `/api/projects/${project.id}`, { pr_watch: true });
  await prWatch.checkProject(project.id);
  assert.equal(prWatch.list().length, 1);
});
