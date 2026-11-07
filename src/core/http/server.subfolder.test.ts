// API のテスト: git のリポジトリの中のフォルダをプロジェクトの本体にする（Git の操作はその中だけ・ワークツリーは一番上の隣に置き、中の同じ位置で作業する）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { setup, until } from "../testing/testServer.js";
import { gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

/** app/ と other/ を持つリポジトリと、app/ を本体にしたプロジェクト */
function subfolderSetup() {
  const ctx = setup();
  const { dir: top, git } = gitRepo({ dir: tempDir({ real: true }), files: { "app/a.txt": "a\n", "other/o.txt": "o\n", "root.txt": "r\n" } });
  const app = path.join(top, "app");
  const project = ctx.store.projects.create({ name: "app", repo_path: app, provider: "claude" });
  return { ...ctx, top, git, app, project, url: (p: string) => `/api/projects/${project.id}${p}` };
}

test("リポジトリの中のフォルダ: 状態・差分・履歴・コミットの詳細・ファイル・検索は、そのフォルダの中だけを、そのフォルダから見たパスで返す", async () => {
  const { call, top, git, app, url } = subfolderSetup();
  fs.writeFileSync(path.join(app, "a.txt"), "a\nb\n");
  fs.writeFileSync(path.join(app, "new.txt"), "n\n");
  fs.writeFileSync(path.join(top, "other", "o.txt"), "o!\n");
  fs.writeFileSync(path.join(top, "outside.txt"), "x\n");

  const status = (await call("GET", url("/git/status"))).body;
  assert.equal(status.branch, "main");
  assert.deepEqual(status.unstaged, [
    { path: "a.txt", kind: "M" },
    { path: "new.txt", kind: "U" },
  ]);
  assert.match((await call("GET", url("/git/diff?path=a.txt"))).body.diff, /^\+b$/m);
  assert.deepEqual((await call("GET", url("/files"))).body.files, ["a.txt", "new.txt"]);
  const found = (await call("GET", url("/search?q=o"))).body;
  assert.deepEqual(found.files, []);
  assert.deepEqual((await call("GET", url("/search?q=n"))).body.files.map((f: { path: string }) => f.path), ["new.txt"]);

  // 外にもステージしたファイルがあれば、一緒にコミットしないよう断る
  await call("POST", url("/git/stage"), { paths: ["a.txt"] });
  git("add", "other/o.txt");
  const refused = await call("POST", url("/git/commit"), { message: "x" });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /other\/o\.txt/);
  git("restore", "--staged", "other/o.txt");
  assert.equal((await call("POST", url("/git/commit"), { message: "app を変える" })).status, 200);
  git("add", "other/o.txt");
  git("commit", "-q", "-m", "other を変える");

  // 履歴は、このフォルダを変えたコミットだけ（親はつなぎ直す）
  const log = (await call("GET", url("/git/log"))).body.commits;
  assert.deepEqual(log.map((c: { subject: string }) => c.subject), ["app を変える", "init"]);
  assert.deepEqual(log[0].parents, [log[1].hash]);
  const detail = (await call("GET", url(`/git/commits/${log[0].hash}`))).body;
  assert.deepEqual(detail.files, [{ path: "a.txt", kind: "M" }]);
  assert.deepEqual((await call("GET", url(`/git/commits/${log[1].hash}`))).body.files, [{ path: "a.txt", kind: "A" }]);
  assert.match((await call("GET", url(`/git/commits/${log[0].hash}/diff?path=a.txt`))).body.diff, /^\+b$/m);
});

test("リポジトリの中のフォルダ: ワークツリーは一番上の隣に置き、中の同じ位置で作業する。まだコミットしていないフォルダは断る", async () => {
  const { call, store, provider, top, git, url } = subfolderSetup();
  const worktreeRoot = path.join(path.dirname(top), `${path.basename(top)}-worktrees`, "feat-a");

  const list = (await call("GET", url("/git/worktrees"))).body;
  assert.deepEqual(list.map((w: { path: string; root: string }) => [w.path, w.root]), [[path.join(top, "app"), top]]);
  assert.equal((await call("GET", url("/git/worktrees/path?branch=feat/a"))).body.path, path.join(worktreeRoot, "app"));

  // チャットのワークツリー: エージェントは中の app/ で動き、Git の操作もそこだけ
  const created = await call("POST", url("/chats"), { text: "並行で", new_worktree_branch: "feat/a" });
  assert.equal(created.status, 201);
  assert.equal(created.body.worktree_path, path.join(worktreeRoot, "app"));
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  assert.equal(provider.lastCwd, path.join(worktreeRoot, "app"));
  fs.writeFileSync(path.join(worktreeRoot, "app", "w.txt"), "w\n");
  fs.writeFileSync(path.join(worktreeRoot, "root-change.txt"), "x\n");
  const q = `?worktree=${encodeURIComponent(path.join(worktreeRoot, "app"))}`;
  assert.deepEqual((await call("GET", url(`/git/status${q}`))).body.unstaged, [{ path: "w.txt", kind: "U" }]);

  // 同じリポジトリの別のフォルダのプロジェクトも、同じブランチなら同じワークツリーを使う
  const other = store.projects.create({ name: "other", repo_path: path.join(top, "other"), provider: "claude" });
  const otherChat = await call("POST", `/api/projects/${other.id}/chats`, { text: "同じブランチ", new_worktree_branch: "feat/a" });
  assert.equal(otherChat.status, 201);
  assert.equal(otherChat.body.worktree_path, path.join(worktreeRoot, "other"));
  await until(() => store.chats.get(otherChat.body.id)?.status === "completed");

  // 消す前の確かめは一番上ごと数え、消すと両方のプロジェクトのチャットが本体に戻る
  assert.equal((await call("GET", url(`/git/worktrees/info?path=${encodeURIComponent(path.join(worktreeRoot, "app"))}`))).body.changes, 2);
  const removed = await call("POST", url("/git/worktrees/remove"), { path: path.join(worktreeRoot, "app"), force: true, delete_branch: true });
  assert.equal(removed.status, 200);
  assert.equal(fs.existsSync(worktreeRoot), false);
  assert.equal(store.chats.get(created.body.id)?.worktree_path, null);
  assert.equal(store.chats.get(otherChat.body.id)?.worktree_path, null);

  // まだコミットしていないフォルダは、新しいワークツリーに出てこないので断る
  fs.mkdirSync(path.join(top, "fresh"));
  fs.writeFileSync(path.join(top, "fresh", "f.txt"), "f\n");
  const fresh = store.projects.create({ name: "fresh", repo_path: path.join(top, "fresh"), provider: "claude" });
  const refused = await call("POST", `/api/projects/${fresh.id}/git/worktrees`, { branch: "feat/b" });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /コミット/);
  git("add", "-A");
  git("commit", "-q", "-m", "fresh");
  assert.equal((await call("POST", `/api/projects/${fresh.id}/git/worktrees`, { branch: "feat/b" })).status, 201);
});

test("リポジトリの中のフォルダ: 取り込み・フォルダの変更は選んだフォルダのまま。ワークツリーのチャットは、同じリポジトリなら中の新しいフォルダへ、別なら本体へ付け替える", async () => {
  const { call, store, top, project, url } = subfolderSetup();
  // 一番上を本体にしたプロジェクトがあっても、中のフォルダは別に登録できる
  const whole = await call("POST", "/api/projects/import", { path: top, name: "whole" });
  assert.equal(whole.status, 201);
  const inspected = (await call("GET", `/api/workspace/inspect?path=${encodeURIComponent(path.join(top, "other"))}`)).body;
  assert.equal(inspected.registered_project_id, null);
  assert.equal(inspected.git_root, top);
  assert.equal((await call("GET", `/api/workspace/inspect?path=${encodeURIComponent(path.join(top, "app"))}`)).body.registered_project_id, project.id);

  const wt = path.join(path.dirname(top), `${path.basename(top)}-worktrees`, "feat-c");
  const chat = (await call("POST", url("/chats"), { text: "wt", new_worktree_branch: "feat/c" })).body;
  await until(() => store.chats.get(chat.id)?.status === "completed");
  assert.equal(chat.worktree_path, path.join(wt, "app"));

  // 同じリポジトリの other/ へ変える → ワークツリーの中の other/ へ
  const moved = await call("PUT", url("/repo-path"), { path: path.join(top, "other") });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.repo_path, path.join(top, "other"));
  assert.equal(store.chats.get(chat.id)?.worktree_path, path.join(wt, "other"));

  // 別のリポジトリへ変える → 本体で続ける（ワークツリーのフォルダは消さない）
  const { dir: elsewhere } = gitRepo({ dir: tempDir({ real: true }), files: { "z.txt": "z" } });
  assert.equal((await call("PUT", url("/repo-path"), { path: elsewhere })).status, 200);
  assert.equal(store.chats.get(chat.id)?.worktree_path, null);
  assert.equal(fs.existsSync(wt), true);
});
