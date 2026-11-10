// API のテスト: ブランチ・タグの操作（履歴の右クリック）と、衝突で止まったマージ・リベース（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { setup } from "../testing/testServer.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

/** プロジェクトのフォルダに main と最初のコミットを作り、ブランチの操作を呼ぶ口を返す */
function branchSetup(files: Record<string, string> = { "a.txt": "one\n" }) {
  const ctx = setup();
  const { call, project } = ctx;
  const { dir, git } = gitRepo({ dir: project.repo_path, files });
  const base = `/api/projects/${project.id}/git`;
  const act = (body: Record<string, unknown>) => call("POST", `${base}/branch-action`, body);
  const refs = async () => (await call("GET", `${base}/refs`)).body;
  const status = async () => (await call("GET", `${base}/status`)).body;
  /** ファイルを書いてコミットする */
  const commit = (file: string, content: string, message: string) => {
    fs.writeFileSync(path.join(dir, file), content);
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  return { ...ctx, dir, git, base, act, refs, status, commit };
}

test("ブランチの操作: 作る・チェックアウト・名前の変更・タグ・削除（マージしていなければ強制で）", async () => {
  const { act, refs, status, commit, git } = branchSetup();

  // 作る（チェックアウトしない）→ 取り出していないので worktree は null
  assert.equal((await act({ action: "create_branch", name: "feature/a", from: "main", checkout: false })).status, 200);
  let branches = (await refs()).branches;
  assert.equal(branches.find((b: { name: string }) => b.name === "feature/a").worktree, null);
  assert.ok(branches.find((b: { name: string }) => b.name === "main").worktree);
  // 同じ名前・使えない名前・「-」で始まる名前は 400
  assert.equal((await act({ action: "create_branch", name: "feature/a", from: "main", checkout: false })).status, 400);
  assert.equal((await act({ action: "create_branch", name: "bad..name", from: "main", checkout: false })).status, 400);
  assert.equal((await act({ action: "checkout", branch: "-f" })).status, 400);

  // チェックアウト
  const checkout = await act({ action: "checkout", branch: "feature/a" });
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.status.branch, "feature/a");
  assert.deepEqual(checkout.body.conflicts, []);
  commit("b.txt", "bee\n", "b を足す");

  // 名前の変更
  assert.equal((await act({ action: "rename_branch", branch: "feature/a", name: "feature/b" })).status, 200);
  assert.equal((await status()).branch, "feature/b");

  // タグ（注釈つき・軽量）と削除
  assert.equal((await act({ action: "create_tag", name: "v1", at: "main", message: "最初の版", push: false })).status, 200);
  assert.equal((await act({ action: "create_tag", name: "v2", at: "feature/b", message: null, push: false })).status, 200);
  assert.equal((await act({ action: "create_tag", name: "v2", at: "main", message: null, push: false })).status, 400);
  assert.deepEqual((await refs()).tags.map((t: { name: string }) => t.name), ["v1", "v2"]);
  assert.equal((await act({ action: "delete_tag", name: "v2", remote: false })).status, 200);
  assert.deepEqual((await refs()).tags.map((t: { name: string }) => t.name), ["v1"]);

  // 新しいブランチを作ってチェックアウト（コミットから）
  const head = git("rev-parse", "HEAD").trim();
  const created = await act({ action: "create_branch", name: "from-commit", from: head, checkout: true });
  assert.equal(created.body.status.branch, "from-commit");

  // 切り離した HEAD（タグから）
  assert.equal((await act({ action: "checkout_detached", ref: "v1" })).body.status.branch, null);
  await act({ action: "checkout", branch: "main" });

  // マージしていないブランチは -d で消せず、強制なら消せる
  const refused = await act({ action: "delete_branch", branch: "feature/b", force: false, remote: false });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /not fully merged/);
  assert.equal((await act({ action: "delete_branch", branch: "feature/b", force: true, remote: false })).status, 200);
  assert.ok(!(await refs()).branches.some((b: { name: string }) => b.name === "feature/b"));
});

test("リモートとのやり取り: プッシュ（追いかけ先を作る）・追跡の設定・早送り・プル・リモートのブランチの削除・チェックアウト", async () => {
  const { act, refs, status, commit, dir } = branchSetup();
  const remote = tempDir();
  gitIn(remote)("init", "-q", "--bare", "-b", "main");
  gitIn(dir)("remote", "add", "origin", remote);

  // 追いかけ先がなければ origin に公開して追いかける
  assert.equal((await act({ action: "push", branch: "main" })).status, 200);
  assert.equal((await refs()).branches.find((b: { name: string }) => b.name === "main").upstream, "origin/main");

  // 別の場所で進めてから取ってくる
  const other = tempDir();
  gitIn(other)("clone", "-q", remote, ".");
  fs.writeFileSync(path.join(other, "c.txt"), "sea\n");
  gitIn(other)("add", "-A");
  gitIn(other)("commit", "-q", "-m", "c を足す");
  gitIn(other)("push", "-q", "origin", "main");
  gitIn(dir)("fetch", "-q");

  // いまのブランチでないブランチの早送り（作業場所は変えない）
  await act({ action: "create_branch", name: "work", from: "main", checkout: true });
  assert.equal((await act({ action: "fast_forward", branch: "main" })).status, 200);
  const main = (await refs()).branches.find((b: { name: string }) => b.name === "main");
  assert.equal(main.behind, 0);
  assert.ok(!fs.existsSync(path.join(dir, "c.txt")));
  // 追いかけ先のないブランチは 400
  assert.equal((await act({ action: "fast_forward", branch: "work" })).status, 400);

  // 追跡の設定と解除
  assert.equal((await act({ action: "set_upstream", branch: "work", upstream: "origin/main" })).status, 200);
  assert.equal((await refs()).branches.find((b: { name: string }) => b.name === "work").upstream, "origin/main");
  // いまのブランチのプル（遅れているので早送りされる）
  const pulled = await act({ action: "pull", branch: "work" });
  assert.equal(pulled.status, 200);
  assert.ok(fs.existsSync(path.join(dir, "c.txt")));
  assert.equal((await act({ action: "set_upstream", branch: "work", upstream: null })).status, 200);
  assert.equal((await refs()).branches.find((b: { name: string }) => b.name === "work").upstream, null);

  // 新しいブランチをプッシュして、リモートのブランチを消す
  commit("d.txt", "dee\n", "d を足す");
  await act({ action: "push", branch: "work" });
  assert.ok((await refs()).remotes[0].branches.some((b: { name: string }) => b.name === "origin/work"));
  assert.equal((await act({ action: "delete_remote_branch", remote_branch: "origin/work" })).status, 200);
  assert.ok(!(await refs()).remotes[0].branches.some((b: { name: string }) => b.name === "origin/work"));

  // リモートのブランチから追いかける手元のブランチを作る
  gitIn(other)("switch", "-q", "-c", "topic");
  gitIn(other)("push", "-q", "-u", "origin", "topic");
  gitIn(dir)("fetch", "-q");
  const tracked = await act({ action: "checkout_remote", remote_branch: "origin/topic", name: "topic" });
  assert.equal(tracked.status, 200);
  assert.equal((await status()).branch, "topic");
  assert.equal((await refs()).branches.find((b: { name: string }) => b.name === "topic").upstream, "origin/topic");
});

test("マージ: 前の見込み（取り込むものなし・早送り・衝突しそう）と、衝突して止まったら解いて続ける・取りやめる", async () => {
  const { act, call, base, status, commit, git, dir } = branchSetup();
  const preview = async (branch: string) => (await call("GET", `${base}/merge-preview?branch=${encodeURIComponent(branch)}`)).body;

  await act({ action: "create_branch", name: "topic", from: "main", checkout: false });
  assert.deepEqual(await preview("topic"), { up_to_date: true, fast_forward: false, conflicts: [] });
  git("switch", "-q", "topic");
  commit("a.txt", "topic\n", "topic で変える");
  git("switch", "-q", "main");
  assert.deepEqual(await preview("topic"), { up_to_date: false, fast_forward: true, conflicts: [] });
  commit("a.txt", "main\n", "main で変える");
  assert.deepEqual(await preview("topic"), { up_to_date: false, fast_forward: false, conflicts: ["a.txt"] });
  // 見込みは作業場所を変えない
  assert.equal((await status()).operation, null);

  // マージすると衝突して止まる（失敗にせず、衝突したファイルを返す）
  const merged = await act({ action: "merge", branch: "topic" });
  assert.equal(merged.status, 200);
  assert.deepEqual(merged.body.conflicts, ["a.txt"]);
  assert.equal(merged.body.status.operation, "merge");
  assert.equal(merged.body.status.conflicts.length, 1);
  // 途中のマージがあるうちは、ほかのマージを始めない・衝突が残っていれば続けられない
  assert.equal((await act({ action: "merge", branch: "topic" })).status, 400);
  assert.equal((await call("POST", `${base}/operation`, { action: "continue" })).status, 400);
  assert.equal((await call("POST", `${base}/operation`, { action: "skip" })).status, 400);

  // 取り込む側の版で解いて続ける → マージのコミットができる
  const resolved = await call("POST", `${base}/resolve`, { path: "a.txt", how: "theirs" });
  assert.equal(resolved.status, 200);
  assert.deepEqual(resolved.body.conflicts, []);
  assert.equal(fs.readFileSync(path.join(dir, "a.txt"), "utf8"), "topic\n");
  const continued = await call("POST", `${base}/operation`, { action: "continue" });
  assert.equal(continued.status, 200);
  assert.equal(continued.body.status.operation, null);
  assert.equal(git("log", "-1", "--format=%P").trim().split(" ").length, 2);

  // もう一度ぶつけて、今度は取りやめる（元の状態に戻る）
  git("switch", "-q", "topic");
  commit("a.txt", "topic 2\n", "topic でまた変える");
  git("switch", "-q", "main");
  commit("a.txt", "main 2\n", "main でまた変える");
  const before = git("rev-parse", "HEAD").trim();
  assert.deepEqual((await act({ action: "merge", branch: "topic" })).body.conflicts, ["a.txt"]);
  const aborted = await call("POST", `${base}/operation`, { action: "abort" });
  assert.equal(aborted.body.status.operation, null);
  assert.equal(git("rev-parse", "HEAD").trim(), before);
  assert.equal(fs.readFileSync(path.join(dir, "a.txt"), "utf8"), "main 2\n");
  // 途中の操作がなければ 400
  assert.equal((await call("POST", `${base}/operation`, { action: "abort" })).status, 400);
});

test("リベース: 衝突して止まったら、こちらの版で解く・飛ばす・取りやめる。衝突しなければそのまま終わる", async () => {
  const { act, call, base, commit, git } = branchSetup();
  await act({ action: "create_branch", name: "topic", from: "main", checkout: true });
  commit("a.txt", "topic\n", "topic で変える");
  commit("t.txt", "tee\n", "t を足す");
  git("switch", "-q", "main");
  commit("a.txt", "main\n", "main で変える");
  git("switch", "-q", "topic");

  const rebased = await act({ action: "rebase", branch: "main" });
  assert.equal(rebased.status, 200);
  assert.deepEqual(rebased.body.conflicts, ["a.txt"]);
  assert.equal(rebased.body.status.operation, "rebase");
  // ぶつかったコミットを飛ばすと、残りのコミット（t を足す）だけが載る
  const skipped = await call("POST", `${base}/operation`, { action: "skip" });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.status.operation, null);
  assert.deepEqual(git("log", "--format=%s", "main..topic").trim().split("\n"), ["t を足す"]);

  // 解決済みにして続ける（いまの中身のまま）
  commit("a.txt", "topic again\n", "topic でまた変える");
  git("switch", "-q", "main");
  commit("a.txt", "main again\n", "main でまた変える");
  git("switch", "-q", "topic");
  assert.deepEqual((await act({ action: "rebase", branch: "main" })).body.conflicts, ["a.txt"]);
  assert.equal((await call("POST", `${base}/resolve`, { path: "a.txt", how: "ours" })).status, 200);
  const continued = await call("POST", `${base}/operation`, { action: "continue" });
  assert.equal(continued.body.status.operation, null);

  // 衝突しないリベースはそのまま終わる
  git("switch", "-q", "main");
  commit("m.txt", "em\n", "m を足す");
  git("switch", "-q", "topic");
  const clean = await act({ action: "rebase", branch: "main" });
  assert.deepEqual(clean.body.conflicts, []);
  assert.equal(clean.body.status.operation, null);
});

test("退避（stash）: 作業中の変更を退避する（未追跡も）・戻す（pop は消す / apply は残す）・消す。退避するものがなければ 400、ぶつかれば衝突したファイル", async () => {
  const { act, refs, status, dir } = branchSetup();
  const stashes = async () => (await refs()).stashes.map((s: { ref: string; message: string }) => s.message);

  // 変更がなければ退避できない
  assert.equal((await act({ action: "stash_save", message: null, include_untracked: false })).status, 400);

  // 変更したファイルを名前を付けて退避 → 作業場所はきれいになる
  fs.writeFileSync(path.join(dir, "a.txt"), "two\n");
  const saved = await act({ action: "stash_save", message: "途中の作業", include_untracked: false });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status.unstaged.length + saved.body.status.staged.length, 0);
  assert.equal((await stashes()).length, 1);
  assert.match((await stashes())[0], /途中の作業/);

  // 未追跡のファイルは include_untracked のときだけ退避する
  fs.writeFileSync(path.join(dir, "new.txt"), "new\n");
  assert.equal((await act({ action: "stash_save", message: null, include_untracked: false })).status, 400);
  assert.equal((await act({ action: "stash_save", message: "未追跡", include_untracked: true })).status, 200);
  assert.ok(!fs.existsSync(path.join(dir, "new.txt")));
  assert.equal((await stashes()).length, 2);

  // apply は戻しても残す、pop は戻したら消す
  assert.equal((await act({ action: "stash_apply", ref: "stash@{0}" })).status, 200);
  assert.ok(fs.existsSync(path.join(dir, "new.txt")));
  assert.equal((await stashes()).length, 2);
  assert.equal((await act({ action: "stash_drop", ref: "stash@{0}" })).status, 200);
  assert.equal((await stashes()).length, 1);
  fs.rmSync(path.join(dir, "new.txt"));

  // 作業中の変更とぶつかる退避を戻すと、衝突したファイルを返す（pop でも退避は残る）
  fs.writeFileSync(path.join(dir, "a.txt"), "three\n");
  gitIn(dir)("commit", "-q", "-am", "a を three に");
  const popped = await act({ action: "stash_pop", ref: "stash@{0}" });
  assert.equal(popped.status, 200);
  assert.deepEqual(popped.body.conflicts, ["a.txt"]);
  assert.equal((await stashes()).length, 1);
  assert.ok((await status()).conflicts.some((f: { path: string }) => f.path === "a.txt"));

  // 名前の形が違えば 400
  assert.equal((await act({ action: "stash_drop", ref: "--all" })).status, 400);
});
