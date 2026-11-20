// 画面からチャットの作業場所を移す API
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { WorkplaceMoveCheck } from "@shared/foundation/apiTypes";
import { setup, until } from "@/app/core/testing/testServer";
import { gitIn, gitRepo } from "@/foundation/core/testing/gitRepo";

type Ctx = ReturnType<typeof setup>;

/** 本体に Git の最初のコミットを作り、本体で 1 回話したチャットを返す */
async function mainChat(ctx: Ctx) {
  gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n", "b.txt": "b\n" } });
  const id: number = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "こんにちは" })).body.id;
  await until(() => !ctx.runner.isBusy(id));
  return id;
}

const boundaryOf = (ctx: Ctx, chatId: number) => {
  const e = ctx.store.events.list(chatId).findLast((x) => x.type === "workplace_moved");
  return e?.type === "workplace_moved" ? e.data : null;
};

test("新しいワークツリーへ移す: いまのコミットから作り、変更を持っていく（ステージしたかも保つ・まだ Git にないファイルも）。区切りは利用者が移した印で、移した先のブランチを書く", async () => {
  const ctx = setup();
  const { call, project, store } = ctx;
  const chatId = await mainChat(ctx);
  const git = gitIn(project.repo_path);
  fs.writeFileSync(path.join(project.repo_path, "a.txt"), "a changed\n");
  git("add", "a.txt");
  fs.writeFileSync(path.join(project.repo_path, "b.txt"), "b changed\n");
  fs.writeFileSync(path.join(project.repo_path, "new.txt"), "new\n");

  const check: WorkplaceMoveCheck = (await call("GET", `/api/chats/${chatId}/workplace`)).body;
  assert.deepEqual([...check.changes].sort(), ["a.txt", "b.txt", "new.txt"]);
  assert.equal(check.blocked, null);

  const res = await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: null, new_worktree_branch: "feat/move", carry: true });
  assert.equal(res.status, 200);
  const wt = res.body.worktree_path as string;
  assert.ok(wt.endsWith("feat-move"));
  assert.equal(res.body.branch, "feat/move");
  // 持っていった変更は新しいワークツリーにあり、元の場所からは消える
  assert.equal(fs.readFileSync(path.join(wt, "a.txt"), "utf8"), "a changed\n");
  assert.equal(fs.readFileSync(path.join(wt, "new.txt"), "utf8"), "new\n");
  assert.equal(gitIn(wt)("diff", "--cached", "--name-only").trim(), "a.txt");
  assert.equal(git("status", "--porcelain").trim(), "");
  // stash の一覧に持っていった跡を残さない
  assert.equal(git("stash", "list").trim(), "");
  const data = boundaryOf(ctx, chatId);
  assert.deepEqual([data?.reason, data?.carried, data?.from.worktree_path, data?.to.worktree_path, data?.to.branch], ["user", true, null, wt, "feat/move"]);
  assert.equal(store.chats.get(chatId)?.session_id, "moved-1");
});

test("いまあるワークツリー・本体へ移す: 変更は持っていかず元の場所に残る。同じ場所・持っていく指定・作業中・実行環境を整えるチャットは断る", async () => {
  const ctx = setup();
  const { call, project, store, runner } = ctx;
  const chatId = await mainChat(ctx);
  const list = (await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feat/x" })).body as { path: string; main: boolean }[];
  const wt = list.find((w) => !w.main)!.path;
  fs.writeFileSync(path.join(project.repo_path, "a.txt"), "dirty\n");

  assert.equal((await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: null })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: wt, carry: true })).status, 400);
  const moved = await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: wt });
  assert.equal(moved.body.worktree_path, wt);
  assert.equal(fs.readFileSync(path.join(project.repo_path, "a.txt"), "utf8"), "dirty\n");
  assert.equal(boundaryOf(ctx, chatId)?.carried, undefined);
  // 本体へ戻す
  const back = await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: null });
  assert.equal(back.body.worktree_path, null);
  assert.equal(store.events.list(chatId).filter((e) => e.type === "workplace_moved").length, 2);

  // 作業中は 409
  await call("POST", `/api/chats/${chatId}/messages`, { text: "続き" });
  if (runner.isBusy(chatId)) assert.equal((await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: wt })).status, 409);
  await until(() => !runner.isBusy(chatId));

  // 実行環境を整えるチャット
  const setupChat = store.chats.create({ project_id: project.id, provider: "claude", title: "整える", status: "completed", worktree_path: wt, untracked_only: true });
  const blocked = await call("POST", `/api/chats/${setupChat.id}/workplace`, { worktree_path: null });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /実行環境を整えるチャット/);
  assert.match((await call("GET", `/api/chats/${setupChat.id}/workplace`)).body.blocked, /実行環境を整える/);
});

test("会話を写せなければ移さない（G6）: 作ったワークツリーを消し、持っていった変更を元の場所に戻す", async () => {
  const ctx = setup();
  const { call, project, store, provider } = ctx;
  const chatId = await mainChat(ctx);
  fs.writeFileSync(path.join(project.repo_path, "a.txt"), "keep me\n");
  provider.copyError = "壊れています";
  const res = await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: null, new_worktree_branch: "feat/fail", carry: true });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /会話を新しいセッションに写せなかった/);
  assert.equal(store.chats.get(chatId)?.worktree_path, null);
  assert.equal(fs.readFileSync(path.join(project.repo_path, "a.txt"), "utf8"), "keep me\n");
  const git = gitIn(project.repo_path);
  assert.equal(git("branch", "--list", "feat/fail").trim(), "");
  assert.equal(git("stash", "list").trim(), "");
  assert.equal(boundaryOf(ctx, chatId), null);
});

test("Git でないプロジェクトは移せない（I4）。移す前の確かめは、元の場所で動いているターミナルを知らせる（Q5）", async () => {
  const ctx = setup();
  const { call, project, store, terminals } = ctx;
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed" });
  const check: WorkplaceMoveCheck = (await call("GET", `/api/chats/${chat.id}/workplace`)).body;
  assert.match(check.blocked ?? "", /Git で管理していない/);
  assert.equal((await call("POST", `/api/chats/${chat.id}/workplace`, { worktree_path: null, new_worktree_branch: "feat/a" })).status, 400);

  gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  await terminals.open({ key: "t1", cwd: project.repo_path, cols: 80, rows: 24, client: { id: "c1", data: () => {}, exit: () => {} }, start: { command: "npm run dev" }, meta: { projectId: project.id, title: "dev" } });
  const after: WorkplaceMoveCheck = (await call("GET", `/api/chats/${chat.id}/workplace`)).body;
  assert.equal(after.blocked, null);
  assert.deepEqual(after.terminals, [{ title: "dev", command: "npm run dev" }]);
});
