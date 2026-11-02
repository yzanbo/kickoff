// API のテスト: Git の変更と、チャットの作業場所（ワークツリー）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { setup, tempDir, until } from "./testing/testServer.js";

test("Git の変更の API（状態と、ファイルごとの差分）", async () => {
  const { call, project } = setup();
  // Git で管理されていないフォルダ
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body, { repo: false });

  const repo = project.repo_path;
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo });
  git("init", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  fs.writeFileSync(path.join(repo, "b.txt"), "bee\n");
  git("add", ".");
  git("commit", "-m", "init");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(repo, "b.txt"), "bee!\n");
  git("add", "b.txt");
  fs.writeFileSync(path.join(repo, "new.txt"), "hello\n");

  const status = (await call("GET", `/api/projects/${project.id}/git/status`)).body;
  assert.equal(status.repo, true);
  assert.equal(status.branch, "main");
  assert.deepEqual(status.staged, [{ path: "b.txt", kind: "M" }]);
  assert.deepEqual(status.unstaged, [
    { path: "a.txt", kind: "M" },
    { path: "new.txt", kind: "U" },
  ]);

  const unstaged = (await call("GET", `/api/projects/${project.id}/git/diff?path=a.txt`)).body;
  assert.match(unstaged.diff, /^\+two$/m);
  assert.equal(unstaged.binary, false);
  const staged = (await call("GET", `/api/projects/${project.id}/git/diff?path=b.txt&staged=1`)).body;
  assert.match(staged.diff, /^-bee$/m);
  assert.match(staged.diff, /^\+bee!$/m);
  // 未追跡のファイルは、すべて追加として出す
  const untracked = (await call("GET", `/api/projects/${project.id}/git/diff?path=new.txt`)).body;
  assert.match(untracked.diff, /^\+hello$/m);
  // リポジトリの外は読ませない
  assert.equal((await call("GET", `/api/projects/${project.id}/git/diff?path=../outside.txt`)).status, 400);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/diff?path=/etc/hosts`)).status, 400);

  // エクスプローラー: 管理しているファイル・未追加のファイル。無視しているフォルダは中を開かずに 1 つ
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "x\n");
  const files = (await call("GET", `/api/projects/${project.id}/files`)).body;
  assert.deepEqual(files.files, [".gitignore", "a.txt", "b.txt", "new.txt"]);
  assert.deepEqual(files.ignored, [{ path: "node_modules", dir: true }]);
  assert.equal(files.truncated, false);
  // ファイルの中身（リポジトリの外・外を指すリンクは読ませない）
  const opened = (await call("GET", `/api/projects/${project.id}/file?path=a.txt`)).body;
  assert.deepEqual({ ...opened, hash: undefined }, { content: "one\ntwo\n", hash: undefined, binary: false, truncated: false });
  assert.match(opened.hash, /^[0-9a-f]{40}$/);
  // 保存: 開いたときの指紋が同じなら書く。ほかで変わっていれば 409 で上書きしない。null なら上書きする
  const saved = await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "one\nTWO\n", base_hash: opened.hash });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  const stale = await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "mine\n", base_hash: opened.hash });
  assert.equal(stale.status, 409);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  assert.equal((await call("PUT", `/api/projects/${project.id}/file`, { path: "a.txt", content: "one\ntwo\n", base_hash: null })).status, 200);
  assert.equal((await call("PUT", `/api/projects/${project.id}/file`, { path: "../outside.txt", content: "x", base_hash: null })).status, 400);
  assert.equal((await call("GET", `/api/projects/${project.id}/file?path=../outside.txt`)).status, 400);
  fs.symlinkSync("/etc/hosts", path.join(repo, "link.txt"));
  assert.equal((await call("GET", `/api/projects/${project.id}/file?path=link.txt`)).status, 400);

  // ファイルの中を探す（大文字・小文字・単語単位・正規表現。無視しているフォルダは探さない）
  fs.writeFileSync(path.join(repo, "c.txt"), "Hello world\nhello-there\nshell\n");
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "hello.js"), "hello\n");
  const search = async (q: string, opts = "") => (await call("GET", `/api/projects/${project.id}/search?q=${encodeURIComponent(q)}${opts}`)).body;
  const hits = await search("hello");
  assert.deepEqual(hits.files, [
    { path: "c.txt", matches: [{ line: 1, column: 1, text: "Hello world" }, { line: 2, column: 1, text: "hello-there" }] },
    { path: "new.txt", matches: [{ line: 1, column: 1, text: "hello" }] },
  ]);
  assert.equal(hits.total, 3);
  assert.equal((await search("hello", "&case=1")).total, 2);
  assert.equal((await search("ell", "&word=1")).total, 0);
  assert.equal((await search("h.llo", "&regex=1")).total, 3);
  assert.equal((await search("h.llo")).total, 0);
  assert.equal((await call("GET", `/api/projects/${project.id}/search?q=${encodeURIComponent("(")}&regex=1`)).status, 400);
  assert.deepEqual(await search(""), { files: [], total: 0, truncated: false });

  // ステージ・ステージの取り消し・元に戻す（未追跡のファイルは消す）
  const post = (action: string, paths: string[]) => call("POST", `/api/projects/${project.id}/git/${action}`, { paths });
  const kinds = (list: { path: string; kind: string }[]) => list.map((f) => `${f.kind} ${f.path}`);
  let st = (await post("stage", ["a.txt", "c.txt"])).body;
  assert.ok(kinds(st.staged).includes("M a.txt") && kinds(st.staged).includes("A c.txt"));
  st = (await post("unstage", ["a.txt", "c.txt"])).body;
  assert.ok(!kinds(st.staged).includes("M a.txt") && kinds(st.unstaged).includes("U c.txt"));
  st = (await post("discard", ["a.txt", "c.txt"])).body;
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\n");
  assert.equal(fs.existsSync(path.join(repo, "c.txt")), false);
  assert.ok(!kinds(st.unstaged).some((k) => k.endsWith(" a.txt") || k.endsWith(" c.txt")));
  assert.equal((await post("discard", ["../outside.txt"])).status, 400);

  // コミット・プッシュ（プッシュ先は手元に作った空のリポジトリ）
  assert.equal((await call("POST", `/api/projects/${project.id}/git/commit`, { message: " " })).status, 400);
  await post("stage", ["b.txt"]);
  st = (await call("POST", `/api/projects/${project.id}/git/commit`, { message: "b を直す" })).body;
  assert.deepEqual(st.staged, []);
  assert.equal((await call("POST", `/api/projects/${project.id}/git/push`)).status, 400);
  const remote = tempDir();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  git("remote", "add", "origin", remote);
  st = (await call("POST", `/api/projects/${project.id}/git/push`)).body;
  assert.equal(st.hasOrigin, true);
  assert.equal(st.upstream, "origin/main");
  assert.equal(st.ahead, 0);
  assert.match(execFileSync("git", ["log", "--oneline", "-1"], { cwd: remote }).toString(), /b を直す/);


  // 履歴: 新しい順。ブランチの印。コミットの詳細と、そのコミットでのファイルの差分
  const log = (await call("GET", `/api/projects/${project.id}/git/log`)).body;
  assert.deepEqual(log.commits.map((c: { subject: string }) => c.subject), ["b を直す", "init"]);
  assert.ok(log.commits[0].refs.includes("HEAD -> main"));
  assert.deepEqual(log.commits[1].parents, []);
  assert.equal(log.more, false);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/log?limit=1`)).body.more, true);
  const detail = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[0].hash}`)).body;
  assert.deepEqual(detail.files, [{ path: "b.txt", kind: "M" }]);
  const first = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[1].hash}`)).body;
  assert.deepEqual(first.files.map((f: { path: string }) => f.path), ["a.txt", "b.txt"]);
  const commitDiff = (await call("GET", `/api/projects/${project.id}/git/commits/${log.commits[0].hash}/diff?path=b.txt`)).body;
  assert.match(commitDiff.diff, /^\+bee!$/m);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/commits/zzz`)).status, 400);

  // ブランチ・リモート・タグ
  git("tag", "v1", log.commits[1].hash);
  const refs = (await call("GET", `/api/projects/${project.id}/git/refs`)).body;
  assert.deepEqual(refs.branches, [{ name: "main", hash: log.commits[0].hash, current: true, upstream: "origin/main", ahead: 0, behind: 0 }]);
  assert.deepEqual(refs.remotes, [{ name: "origin", branches: [{ name: "origin/main", hash: log.commits[0].hash }] }]);
  assert.deepEqual(refs.tags, [{ name: "v1", hash: log.commits[1].hash }]);
  assert.deepEqual(refs.stashes, []);

  // ワークツリー: 作る（リポジトリの隣のフォルダ）・一覧・変更があれば force でないと消せない
  const wtUrl = `/api/projects/${project.id}/git/worktrees`;
  assert.equal((await call("GET", wtUrl)).body.length, 1);
  assert.equal((await call("POST", wtUrl, { branch: "bad name" })).status, 400);
  const created = await call("POST", wtUrl, { branch: "feature/x" });
  assert.equal(created.status, 201);
  const wt = created.body.find((w: { branch: string }) => w.branch === "feature/x");
  assert.equal(wt.path, path.join(path.dirname(fs.realpathSync(repo)), `${path.basename(fs.realpathSync(repo))}-worktrees`, "feature-x"));
  assert.equal(created.body[0].main, true);
  fs.writeFileSync(path.join(wt.path, "wip.txt"), "wip\n");
  assert.equal((await call("POST", `${wtUrl}/remove`, { path: wt.path })).status, 400);
  assert.equal((await call("POST", `${wtUrl}/remove`, { path: created.body[0].path })).status, 400);
  const removed = (await call("POST", `${wtUrl}/remove`, { path: wt.path, force: true })).body;
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(wt.path), false);
  fs.rmSync(path.dirname(wt.path), { recursive: true, force: true });

  // プル: ほかの手元から押されたコミットを、早送りで取り込む
  const other = tempDir();
  execFileSync("git", ["clone", "-q", remote, other]);
  fs.writeFileSync(path.join(other, "from-other.txt"), "x\n");
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "add", "."], { cwd: other });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "ほかから"], { cwd: other });
  execFileSync("git", ["push", "-q"], { cwd: other });
  // フェッチで、遅れている数がわかる
  assert.equal((await call("POST", `/api/projects/${project.id}/git/fetch`)).body.behind, 1);
  const pulled = await call("POST", `/api/projects/${project.id}/git/pull`);
  assert.equal(pulled.body.behind, 0);
  assert.equal(pulled.status, 200);
  assert.equal(fs.existsSync(path.join(repo, "from-other.txt")), true);
});

test("チャットの作業場所: 新しいワークツリーを作って、その中でエージェントを動かす。Git の操作も作業場所ごと", async () => {
  const { call, project, store, provider } = setup();
  const repo = project.repo_path;
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: repo });
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");

  // 本体（指定なし）
  const main = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "本体で" })).body;
  assert.equal(main.worktree_path, "");
  await until(() => store.getRun(main.id)?.status === "completed");
  assert.equal(provider.lastCwd, repo);

  // 新しいワークツリー
  const created = await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "並行で", new_worktree_branch: "feat/a" });
  assert.equal(created.status, 201);
  const worktree = created.body.worktree_path;
  assert.ok(worktree.endsWith(path.join(`${path.basename(fs.realpathSync(repo))}-worktrees`, "feat-a")));
  await until(() => store.getRun(created.body.id)?.status === "completed");
  assert.equal(provider.lastCwd, worktree);

  // いまあるワークツリーを選ぶ・知らないフォルダは断る
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "同じ所", worktree_path: worktree })).body.worktree_path, worktree);
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "x", worktree_path: "/tmp" })).status, 400);

  // Git の操作は ?worktree= のワークツリーで行う
  fs.writeFileSync(path.join(worktree, "b.txt"), "b\n");
  const q = `?worktree=${encodeURIComponent(worktree)}`;
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status${q}`)).body.unstaged, [{ path: "b.txt", kind: "U" }]);
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body.unstaged, []);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent("/tmp")}`)).status, 400);

  // 片付け: ワークツリーと手元のブランチを消す（本体は片付けられない）
  fs.rmSync(path.join(worktree, "b.txt"));
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: repo })).status, 400);
  const finished = await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: worktree });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.length, 1);
  // そこで作業していたチャットは、本体に戻る。作業したブランチの名前は残す
  assert.equal(store.getRun(created.body.id)?.worktree_path, "");
  assert.equal(store.getRun(created.body.id)?.branch, "feat/a");
  assert.equal(store.getRun(main.id)?.branch, "main");
  // いまの作業を始めた時刻（作業中のチャットの経過時間に使う）
  assert.ok(store.getRun(main.id)?.turn_started_at);
  assert.equal(fs.existsSync(worktree), false);
  assert.equal(execFileSync("git", ["branch", "--list", "feat/a"], { cwd: repo }).toString().trim(), "");

  // エディタタブの履歴から消したときも、チャットは本体に戻る（ブランチの名前は残す）
  const other = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "別の作業", new_worktree_branch: "feat/b" })).body;
  await until(() => store.getRun(other.id)?.status === "completed");
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: other.worktree_path })).status, 200);
  assert.equal(store.getRun(other.id)?.worktree_path, "");
  assert.equal(store.getRun(other.id)?.branch, "feat/b");

  // アプリの外でフォルダを消したワークツリー: 続きを送ると分かる文で失敗し、片付けると Git の記録を消してチャットは本体に戻る
  const gone = (await call("POST", `/api/projects/${project.id}/runs`, { phase: "implementation", prompt: "消える所", new_worktree_branch: "feat/c" })).body;
  await until(() => store.getRun(gone.id)?.status === "completed");
  fs.rmSync(gone.worktree_path, { recursive: true, force: true });
  // フォルダが消えた作業場所の Git の操作は 404（「Git で管理されていません」と紛らわしく出さない）
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent(gone.worktree_path)}`)).status, 404);
  assert.equal((await call("POST", `/api/runs/${gone.id}/messages`, { text: "続き" })).status, 200);
  await until(() => store.getRun(gone.id)?.status === "failed");
  assert.match(store.getRun(gone.id)?.error ?? "", /作業場所のフォルダが見つかりません/);
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: gone.worktree_path })).status, 200);
  assert.equal(store.getRun(gone.id)?.worktree_path, "");
  assert.equal(store.getRun(gone.id)?.branch, "feat/c");
  fs.rmSync(path.dirname(worktree), { recursive: true, force: true });
});
