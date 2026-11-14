// ワークツリーの後始末（画面の「消す」と AI の finish_worktree。メモの仕様書「0019_AI の操作ツールの追加」の F）: 確かめ・控え（ゴミ箱に 3 日）・予約・戻す
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { TRASH_KEEP_MS } from "@shared/types";
import { setup, until } from "../testing/testServer.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

type Ctx = ReturnType<typeof setup>;

/** Git のプロジェクトと、新しいワークツリーで動かして終わったチャット */
async function worktreeChat(ctx: Ctx, branch: string) {
  const { call, project, store } = ctx;
  const created = (await call("POST", `/api/projects/${project.id}/chats`, { text: "並行で", new_worktree_branch: branch })).body;
  await until(() => store.chats.get(created.id)?.status === "completed");
  return { chatId: created.id as number, wt: created.worktree_path as string };
}

/** 本体で動かして終わったチャット */
async function mainChat(ctx: Ctx) {
  const created = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "本体で" })).body;
  await until(() => ctx.store.chats.get(created.id)?.status === "completed");
  return created.id as number;
}

const notices = (ctx: Ctx, chatId: number) => ctx.store.events.list(chatId).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
const refs = (repo: string) => execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/kickoff/"], { cwd: repo }).toString().trim();

test("画面の「消す」: 失うもの（force の変更・delete_branch の取り込んでいないコミット）は控えに入れてゴミ箱に 3 日残り、戻すと同じ名前で作り直して変更も戻る", async () => {
  const ctx = setup();
  const { call, project, store } = ctx;
  const { dir: repo } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n", "gone.txt": "x\n" } });
  const { chatId, wt } = await worktreeChat(ctx, "feat/d");
  fs.writeFileSync(path.join(wt, "d.txt"), "d\n");
  gitIn(wt)("add", "d.txt");
  gitIn(wt)("commit", "-q", "-m", "d");
  fs.writeFileSync(path.join(wt, "a.txt"), "書きかけ\n");
  fs.writeFileSync(path.join(wt, "new.txt"), "まだ Git にない\n");
  fs.rmSync(path.join(wt, "gone.txt"));
  const removed = await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: wt, force: true, delete_branch: true });
  assert.equal(removed.status, 200);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(store.chats.get(chatId)?.worktree_path, null);
  assert.deepEqual(notices(ctx, chatId).at(-1), "ワークツリー（feat/d）を片付けました。次からは本体で動きます");
  const [item] = (await call("GET", `/api/projects/${project.id}/trash`)).body;
  assert.equal(item.kind, "worktree");
  assert.equal(item.label, "ワークツリー feat/d（取り込んでいないコミット 1 個・変更 3 ファイル）");
  assert.equal(item.by_chat_id, null);
  assert.match(refs(repo), /refs\/kickoff\/trash\/.*\/branch\nrefs\/kickoff\/trash\/.*\/changes/);
  // 戻す: ブランチ（取り込んでいないコミットも）と途中の変更（まだ Git にないファイル・消したファイルも）が戻り、控えの参照は消える
  assert.equal((await call("POST", `/api/trash/${item.id}/restore`, {})).status, 200);
  assert.equal(fs.readFileSync(path.join(wt, "d.txt"), "utf8"), "d\n");
  assert.equal(fs.readFileSync(path.join(wt, "a.txt"), "utf8"), "書きかけ\n");
  assert.equal(fs.readFileSync(path.join(wt, "new.txt"), "utf8"), "まだ Git にない\n");
  assert.equal(fs.existsSync(path.join(wt, "gone.txt")), false);
  assert.equal(gitIn(wt)("diff", "--cached", "--name-only").trim(), "", "戻した変更はコミットしていない変更のまま");
  assert.equal(refs(repo), "");
  assert.equal((await call("GET", `/api/projects/${project.id}/trash`)).body.length, 0);
});

test("画面の「消す」: 失うものがなければ控えを作らない。控えは 3 日たったら参照ごと消える", async () => {
  const ctx = setup();
  const { call, project, trashBin, trashClock } = ctx;
  const { dir: repo } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const { wt } = await worktreeChat(ctx, "feat/clean");
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: wt, delete_branch: true })).status, 200);
  assert.equal((await call("GET", `/api/projects/${project.id}/trash`)).body.length, 0);
  // 変更を捨てた控えは 3 日で消える
  const { wt: wt2 } = await worktreeChat(ctx, "feat/x");
  fs.writeFileSync(path.join(wt2, "x.txt"), "x\n");
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: wt2, force: true })).status, 200);
  assert.notEqual(refs(repo), "");
  trashClock.now += TRASH_KEEP_MS + 1000;
  await trashBin.sweep();
  assert.equal(refs(repo), "");
});

test("AI の後始末（本体のチャットから）: ローカルで取り込み済みなら控えなしでその場で消し、結果をお知らせと AI に返す文に出す", async () => {
  const ctx = setup();
  const { project, store, worktreeFinisher } = ctx;
  const { dir: repo, git } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const { chatId: wtChat, wt } = await worktreeChat(ctx, "feat/m");
  fs.writeFileSync(path.join(wt, "m.txt"), "m\n");
  gitIn(wt)("add", "m.txt");
  gitIn(wt)("commit", "-q", "-m", "m");
  git("merge", "-q", "feat/m");
  const main = await mainChat(ctx);
  // 指さないと、いまあるワークツリーを添えて断る
  await assert.rejects(worktreeFinisher.finishFromChat(main, undefined), /いまあるワークツリー: feat\/m/);
  const text = await worktreeFinisher.finishFromChat(main, "feat/m");
  assert.match(text, /取り込み済み（ローカル（main））のワークツリー（ブランチ feat\/m）を片付けました。/);
  assert.match(text, /チャット 1 件は、次から本体で動きます/);
  assert.equal(notices(ctx, main).at(-1), text);
  assert.equal(store.chats.get(wtChat)?.worktree_path, null);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(execFileSync("git", ["branch", "--list", "feat/m"], { cwd: repo }).toString().trim(), "");
  assert.equal(store.trash.list(project.id).length, 0);
});

test("AI の後始末: GitHub で PR がマージ済み（squash でも）なら取り込み済みとし、リモートのブランチも消す。取り込んでいなければ控えに入れたことをはっきり書く", async () => {
  const ctx = setup();
  const { project, store, prFake, worktreeFinisher } = ctx;
  const { dir: repo } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const remote = tempDir();
  execFileSync("git", ["init", "-q", "--bare", remote]);
  gitIn(repo)("remote", "add", "origin", remote);
  const { wt } = await worktreeChat(ctx, "feat/gh");
  fs.writeFileSync(path.join(wt, "g.txt"), "g\n");
  gitIn(wt)("add", "g.txt");
  gitIn(wt)("commit", "-q", "-m", "g");
  gitIn(wt)("push", "-q", "-u", "origin", "feat/gh");
  prFake.merged["feat/gh"] = { number: 12, url: "https://github.com/o/r/pull/12", head_sha: gitIn(wt)("rev-parse", "HEAD").trim() };
  const main = await mainChat(ctx);
  const text = await worktreeFinisher.finishFromChat(main, "feat/gh");
  assert.match(text, /取り込み済み（GitHub の PR #12）/);
  assert.match(text, /リモートのブランチ（origin\/feat\/gh）も消しました/);
  assert.equal(execFileSync("git", ["ls-remote", "--heads", remote, "feat/gh"]).toString().trim(), "");
  assert.equal(store.trash.list(project.id).length, 0);

  // PR のあとに手元でコミットを足していたら取り込み済みにしない（控えに入れ、リモートのブランチは残す）
  const { wt: wt2 } = await worktreeChat(ctx, "feat/more");
  gitIn(wt2)("commit", "-q", "--allow-empty", "-m", "1");
  gitIn(wt2)("push", "-q", "-u", "origin", "feat/more");
  prFake.merged["feat/more"] = { number: 13, url: "u", head_sha: gitIn(wt2)("rev-parse", "HEAD").trim() };
  gitIn(wt2)("commit", "-q", "--allow-empty", "-m", "2");
  const more = await worktreeFinisher.finishFromChat(main, "feat/more");
  assert.match(more, /取り込んでいないコミット 2 個を控えに入れて消しました。3 日間はゴミ箱から戻せます。/);
  assert.notEqual(execFileSync("git", ["ls-remote", "--heads", remote, "feat/more"]).toString().trim(), "");
  const [item] = store.trash.list(project.id);
  assert.equal(item.kind, "worktree");
  assert.equal(item.by_chat_id, main);
});

test("AI の後始末（ワークツリー自身のチャットから）: 予約して作業の終わりに消し、送信待ちは止めておく。ほかのワークツリーのチャットからは消せない", async () => {
  const ctx = setup();
  const { call, project, store, provider, runner, worktreeFinisher } = ctx;
  gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  const { chatId, wt } = await worktreeChat(ctx, "feat/self");
  const { chatId: otherChat } = await worktreeChat(ctx, "feat/other");
  await assert.rejects(worktreeFinisher.finishFromChat(otherChat, "feat/self"), /ほかのワークツリーのチャットからは消せません/);
  // 本体のチャットからは、作業中のチャットがあれば断る（待たない）
  const main = await mainChat(ctx);
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "実装して" });
  await until(() => runner.isBusy(chatId));
  await assert.rejects(worktreeFinisher.finishFromChat(main, "feat/self"), /作業中のチャットがあるので消せません/);
  // 自分のワークツリー: 予約だけして、作業中は消さない
  const text = await worktreeFinisher.finishFromChat(chatId, undefined);
  assert.match(text, /予約しました。このチャットの作業が終わったら/);
  assert.match(text, /失うものはありません/);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { text: "次の指示" })).body.queued, true);
  assert.ok(fs.existsSync(wt));
  release();
  await until(() => store.chats.get(chatId)?.worktree_path === null);
  assert.equal(fs.existsSync(wt), false);
  // 頼んだチャット自身にも「次からは本体で動きます」を残し、そのあとに結果のお知らせ
  assert.equal(notices(ctx, chatId).at(-2), "ワークツリー（feat/self）を片付けました。次からは本体で動きます");
  assert.match(notices(ctx, chatId).at(-1) ?? "", /ワークツリー（ブランチ feat\/self）を片付けました/);
  // 送信待ちは止めたまま（本体で勝手に動かない）
  const queue = (await call("GET", `/api/chats/${chatId}`)).body.live.queue;
  assert.equal(queue.paused, true);
  assert.equal(queue.messages.length, 1);
  assert.equal(runner.isBusy(chatId), false);
});
