// API のテスト: Git の変更と、チャットの作業場所（ワークツリー）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AUTH, setup, until } from "../testing/testServer.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

test("Git の変更の API（状態と、ファイルごとの差分）", async () => {
  const ctx = setup();
  const { call, project } = ctx;
  // Git で管理されていないフォルダ（ワークツリーの一覧は失敗にせず空）
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body, { repo: false });
  assert.deepEqual(await call("GET", `/api/projects/${project.id}/git/worktrees`), { status: 200, body: [] });

  const { dir: repo, git } = gitRepo({ dir: project.repo_path, files: { "a.txt": "one\n", "b.txt": "bee\n" } });
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
  // 差分の元の中身（未ステージは索引、ステージ済みは HEAD、未追跡は空）
  const original = async (query: string) => (await call("GET", `/api/projects/${project.id}/git/original?${query}`)).body;
  assert.deepEqual(await original("path=a.txt"), { content: "one\n", binary: false, truncated: false });
  assert.equal((await original("path=b.txt")).content, "bee!\n");
  assert.equal((await original("path=b.txt&staged=1")).content, "bee\n");
  assert.equal((await original("path=new.txt")).content, "");
  assert.equal((await call("GET", `/api/projects/${project.id}/git/original?path=../outside.txt`)).status, 400);
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

  // 画像のプレビュー: 中身をそのまま、その種類で返す。icns は中のいちばん大きい PNG。画像でない・外を指すリンク・外は 400
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  fs.writeFileSync(path.join(repo, "pic.png"), png);
  const icnsEntry = Buffer.alloc(8);
  icnsEntry.write("ic10", 0, "latin1");
  icnsEntry.writeUInt32BE(png.length + 8, 4);
  const icnsHead = Buffer.alloc(8);
  icnsHead.write("icns", 0, "latin1");
  icnsHead.writeUInt32BE(png.length + 16, 4);
  fs.writeFileSync(path.join(repo, "icon.icns"), Buffer.concat([icnsHead, icnsEntry, png]));
  const image = (file: string) => ctx.app.request(`/api/projects/${project.id}/file/image?path=${encodeURIComponent(file)}`, { headers: AUTH });
  const picture = await image("pic.png");
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get("content-type"), "image/png");
  assert.equal(picture.headers.get("content-security-policy"), "sandbox");
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), png);
  const icon = await image("icon.icns");
  assert.equal(icon.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), png);
  assert.equal((await image("a.txt")).status, 400);
  fs.symlinkSync("/etc/hosts", path.join(repo, "outside.png"));
  assert.equal((await image("outside.png")).status, 400);
  assert.equal((await image("../x.png")).status, 400);

  // HTML のファイルのプレビューが読む口: 1 段目が作業場所（"-" = 本体）、後ろが作業場所からの相対パス。種類ごとの Content-Type と sandbox
  fs.mkdirSync(path.join(repo, "site", "css"), { recursive: true });
  fs.writeFileSync(path.join(repo, "site", "index.html"), "<h1>hi</h1>");
  fs.writeFileSync(path.join(repo, "site", "css", "a b.css"), "h1{color:red}");
  const asset = (place: string, rel: string) => ctx.app.request(`/api/projects/${project.id}/file/asset/${place}/${rel}`, { headers: AUTH });
  const page = await asset("-", "site/index.html");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(page.headers.get("content-security-policy"), "sandbox");
  const css = await asset("-", `site/css/${encodeURIComponent("a b.css")}`);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(await css.text(), "h1{color:red}");
  // 作業場所の外・リンクで外を指すもの・このプロジェクトのワークツリーでないものは 400、ないものは 404
  assert.equal((await asset("-", "outside.png")).status, 400);
  assert.equal((await asset("-", "..%2Fx.html")).status, 400);
  assert.equal((await asset(encodeURIComponent("/tmp/not-a-worktree"), "site/index.html")).status, 400);
  assert.equal((await asset("-", "site/none.css")).status, 404);
  assert.equal((await ctx.app.request(`/api/projects/${project.id}/file/asset/-/site/index.html`)).status, 401);

  // 名前の変更: 同じフォルダの中で変え、変えたあとのパスを返す。同じ名前があれば 409、ないものは 404、使えない名前・外は 400
  fs.mkdirSync(path.join(repo, "dir"));
  fs.writeFileSync(path.join(repo, "dir", "old.txt"), "x\n");
  const renamed = await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/old.txt", name: "new name.txt" });
  assert.deepEqual([renamed.status, renamed.body], [200, { path: "dir/new name.txt" }]);
  assert.equal(fs.existsSync(path.join(repo, "dir", "new name.txt")), true);
  assert.equal(fs.existsSync(path.join(repo, "dir", "old.txt")), false);
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/new name.txt", name: "../up.txt" })).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/new name.txt", name: ".." })).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/missing.txt", name: "x.txt" })).status, 404);
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/new name.txt", name: "NEW NAME.txt" })).status, 200);
  fs.writeFileSync(path.join(repo, "dir", "other.txt"), "y\n");
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir/other.txt", name: "NEW NAME.txt" })).status, 409);
  // フォルダの名前も変えられる
  const dir = await call("POST", `/api/projects/${project.id}/file/rename`, { path: "dir", name: "dir2" });
  assert.deepEqual(dir.body, { path: "dir2" });
  assert.equal((await call("POST", `/api/projects/${project.id}/file/rename`, { path: "../outside.txt", name: "x.txt" })).status, 400);

  // 新しいファイル・フォルダ: 途中のフォルダも作る。同じ名前は 409、使えない名前・外は 400
  const made = await call("POST", `/api/projects/${project.id}/files`, { path: "dir2/sub/new.ts" });
  assert.deepEqual([made.status, made.body], [201, { path: "dir2/sub/new.ts" }]);
  assert.equal(fs.readFileSync(path.join(repo, "dir2", "sub", "new.ts"), "utf8"), "");
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "dir2/sub/new.ts" })).status, 409);
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "empty", dir: true })).status, 201);
  assert.equal(fs.statSync(path.join(repo, "empty")).isDirectory(), true);
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "empty/../x.ts" })).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "../outside.ts" })).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "a//b.ts" })).status, 400);
  // リンクで外を指すフォルダの中には作らない
  const outside = tempDir();
  fs.symlinkSync(outside, path.join(repo, "out-link"));
  assert.equal((await call("POST", `/api/projects/${project.id}/files`, { path: "out-link/deep/x.ts" })).status, 400);
  assert.equal(fs.existsSync(path.join(outside, "deep")), false);
  fs.unlinkSync(path.join(repo, "out-link"));
  // 空のフォルダも一覧に出す（中の空のフォルダも）
  fs.mkdirSync(path.join(repo, "empty", "inner"));
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/files`)).body.empty_dirs, ["empty", "empty/inner"]);

  // ゴミ箱へ移す（テストでは消して覚える）。ないものは 404、外は 400
  const { memoFake } = ctx;
  assert.equal((await call("DELETE", `/api/projects/${project.id}/file?path=empty`)).status, 204);
  assert.deepEqual(memoFake.trashed, [path.join(fs.realpathSync(repo), "empty")]);
  assert.equal((await call("DELETE", `/api/projects/${project.id}/file?path=empty`)).status, 404);
  assert.equal((await call("DELETE", `/api/projects/${project.id}/file?path=../outside.txt`)).status, 400);
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/files`)).body.empty_dirs, []);

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
  // 含める・除外するファイル（glob のカンマ区切り）と、無視しているファイルも探す（ignore=0）
  const paths = (r: { files: { path: string }[] }) => r.files.map((f) => f.path);
  assert.deepEqual(paths(await search("hello", "&include=c.txt")), ["c.txt"]);
  assert.deepEqual(paths(await search("hello", `&exclude=${encodeURIComponent("c.*")}`)), ["new.txt"]);
  assert.deepEqual(paths(await search("hello", `&include=${encodeURIComponent("*.js")}&ignore=0`)), ["node_modules/pkg/hello.js"]);

  // 置換: 結果の行だけを置き換え、置換する前の中身と指紋を返す。探したあとで変わった行は置換しない
  const replace = (body: object) => call("POST", `/api/projects/${project.id}/search/replace`, body);
  const q = { query: "hello", case_sensitive: false, whole_word: false, regex: false, include: "", exclude: "", use_ignore: true };
  const replaced = await replace({
    query: q,
    replace: "bye",
    preserve_case: true,
    files: [
      { path: "c.txt", lines: [{ line: 1, text: "Hello world" }, { line: 2, text: "stale" }] },
      { path: "missing.txt", lines: [{ line: 1, text: "hello" }] },
    ],
  });
  assert.equal(replaced.status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "c.txt"), "utf8"), "Bye world\nhello-there\nshell\n");
  assert.equal(replaced.body.replaced, 1);
  assert.deepEqual(replaced.body.files.map((f: { path: string; count: number; before: string }) => [f.path, f.count, f.before]), [["c.txt", 1, "Hello world\nhello-there\nshell\n"]]);
  assert.match(replaced.body.files[0].hash, /^[0-9a-f]{40}$/);
  assert.deepEqual(replaced.body.skipped.map((s: { path: string }) => s.path), ["c.txt", "missing.txt"]);
  // 正規表現の $1 と、改行が CRLF のファイル
  fs.writeFileSync(path.join(repo, "crlf.txt"), "key=1\r\nkey=2\r\n");
  await replace({ query: { ...q, query: "key=(\\d)", regex: true }, replace: "k$1", preserve_case: false, files: [{ path: "crlf.txt", lines: [{ line: 2, text: "key=2\r" }] }] });
  assert.equal(fs.readFileSync(path.join(repo, "crlf.txt"), "utf8"), "key=1\r\nk2\r\n");
  // 正しくない正規表現・リポジトリの外は 400
  assert.equal((await replace({ query: { ...q, query: "(", regex: true }, replace: "", preserve_case: false, files: [{ path: "c.txt", lines: [{ line: 1, text: "x" }] }] })).status, 400);
  assert.equal((await replace({ query: q, replace: "", preserve_case: false, files: [{ path: "../outside.txt", lines: [{ line: 1, text: "x" }] }] })).status, 400);

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
  // コミット (修正): メッセージが空なら前のメッセージのまま、書けばそのメッセージに書き直す（コミットは増えない）
  const commitCount = () => execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repo }).toString().trim();
  const before = commitCount();
  assert.equal((await call("POST", `/api/projects/${project.id}/git/commit`, { message: "", amend: true })).status, 200);
  assert.match(execFileSync("git", ["log", "--format=%s", "-1"], { cwd: repo }).toString(), /b を直す/);
  st = (await call("POST", `/api/projects/${project.id}/git/commit`, { message: "b を直す（修正）", amend: true })).body;
  assert.deepEqual(st.staged, []);
  assert.equal(commitCount(), before);
  assert.match(execFileSync("git", ["log", "--format=%s", "-1"], { cwd: repo }).toString(), /b を直す（修正）/);
  // 下の履歴の確かめのため、もとのメッセージに戻す
  await call("POST", `/api/projects/${project.id}/git/commit`, { message: "b を直す", amend: true });

  // 行ごとの変更の記録: コミットした行はそのコミット、書き足してまだコミットしていない行は uncommitted。Git で管理していないファイルは null
  fs.appendFileSync(path.join(repo, "b.txt"), "more\n");
  const blame = (await call("GET", `/api/projects/${project.id}/git/blame?path=b.txt`)).body;
  assert.equal(blame.lines.length, 2);
  assert.equal(blame.commits[blame.lines[0]].summary, "b を直す");
  assert.equal(blame.commits[blame.lines[1]].uncommitted, true);
  fs.writeFileSync(path.join(repo, "b.txt"), "bee!\n");
  fs.writeFileSync(path.join(repo, "untracked.txt"), "x\n");
  assert.equal((await call("GET", `/api/projects/${project.id}/git/blame?path=untracked.txt`)).body, null);
  fs.rmSync(path.join(repo, "untracked.txt"));
  assert.equal((await call("GET", `/api/projects/${project.id}/git/blame?path=../outside.txt`)).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/git/push`)).status, 400);
  const remote = tempDir();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  git("remote", "add", "origin", remote);
  st = (await call("POST", `/api/projects/${project.id}/git/push`)).body;
  assert.equal(st.has_origin, true);
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
  // worktree は取り出している作業場所（本体のフォルダ。リンクを解いたパス）
  assert.deepEqual(refs.branches, [{ name: "main", hash: log.commits[0].hash, current: true, upstream: "origin/main", ahead: 0, behind: 0, worktree: fs.realpathSync(repo) }]);
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

  // プル: ほかの手元から押されたコミットを、早送りで取り込む
  const other = tempDir();
  execFileSync("git", ["clone", "-q", remote, other]);
  fs.writeFileSync(path.join(other, "from-other.txt"), "x\n");
  const gitOther = gitIn(other);
  gitOther("add", ".");
  gitOther("commit", "-q", "-m", "ほかから");
  gitOther("push", "-q");
  // フェッチで、遅れている数がわかる
  assert.equal((await call("POST", `/api/projects/${project.id}/git/fetch`)).body.behind, 1);
  const pulled = await call("POST", `/api/projects/${project.id}/git/pull`);
  assert.equal(pulled.body.behind, 0);
  assert.equal(pulled.status, 200);
  assert.equal(fs.existsSync(path.join(repo, "from-other.txt")), true);
});

test("チャットの作業場所: 新しいワークツリーを作って、その中でエージェントを動かす。Git の操作も作業場所ごと", async () => {
  const { call, project, store, provider } = setup();
  const { dir: repo } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });

  // 本体（指定なし）
  const main = (await call("POST", `/api/projects/${project.id}/chats`, { text: "本体で" })).body;
  assert.equal(main.worktree_path, null);
  await until(() => store.chats.get(main.id)?.status === "completed");
  assert.equal(provider.lastCwd, repo);

  // 新しいワークツリー
  const created = await call("POST", `/api/projects/${project.id}/chats`, { text: "並行で", new_worktree_branch: "feat/a" });
  assert.equal(created.status, 201);
  const worktree = created.body.worktree_path;
  assert.ok(worktree.endsWith(path.join(`${path.basename(fs.realpathSync(repo))}-worktrees`, "feat-a")));
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  assert.equal(provider.lastCwd, worktree);

  // いまあるワークツリーを選ぶ・知らないフォルダは断る
  assert.equal((await call("POST", `/api/projects/${project.id}/chats`, { text: "同じ所", worktree_path: worktree })).body.worktree_path, worktree);
  assert.equal((await call("POST", `/api/projects/${project.id}/chats`, { text: "x", worktree_path: "/tmp" })).status, 400);

  // Git の操作は ?worktree= のワークツリーで行う
  fs.writeFileSync(path.join(worktree, "b.txt"), "b\n");
  const q = `?worktree=${encodeURIComponent(worktree)}`;
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status${q}`)).body.unstaged, [{ path: "b.txt", kind: "U" }]);
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/git/status`)).body.unstaged, []);
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent("/tmp")}`)).status, 400);

  // 片付け（PR がマージされたあと）: ブランチも消す「消す」で、ワークツリーと手元のブランチを消す（本体は消せない。ワークツリーでないフォルダは 404）
  const removeUrl = `/api/projects/${project.id}/git/worktrees/remove`;
  fs.rmSync(path.join(worktree, "b.txt"));
  assert.deepEqual(await call("POST", removeUrl, { path: fs.realpathSync(repo), delete_branch: true }), { status: 400, body: { error: "本体のフォルダは消せません" } });
  assert.deepEqual(await call("POST", removeUrl, { path: "/no/such/worktree", delete_branch: true }), { status: 404, body: { error: "ワークツリーが見つかりません" } });
  // 以前の「片付ける」の個別のルートはなくした
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/finish`, { path: worktree })).status, 404);
  const finished = await call("POST", removeUrl, { path: worktree, delete_branch: true });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.length, 1);
  // そこで作業していたチャットは、本体に戻る。作業したブランチの名前は残す
  assert.equal(store.chats.get(created.body.id)?.worktree_path, null);
  assert.equal(store.chats.get(created.body.id)?.branch, "feat/a");
  assert.equal(store.chats.get(main.id)?.branch, "main");
  // いまの作業を始めた時刻（作業中のチャットの経過時間に使う）
  assert.ok(store.chats.get(main.id)?.turn_started_at);
  assert.equal(fs.existsSync(worktree), false);
  assert.equal(execFileSync("git", ["branch", "--list", "feat/a"], { cwd: repo }).toString().trim(), "");

  // 消す前の確かめ: コミットしていない変更・このブランチにしかないコミット。ブランチも一緒に消せる
  const wt = (await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feat/d" })).body.find((w: { branch: string }) => w.branch === "feat/d").path;
  fs.writeFileSync(path.join(wt, "d.txt"), "d\n");
  gitIn(wt)("add", "d.txt");
  gitIn(wt)("commit", "-q", "-m", "d");
  fs.writeFileSync(path.join(wt, "e.txt"), "e\n");
  const info = await call("GET", `/api/projects/${project.id}/git/worktrees/info?path=${encodeURIComponent(wt)}`);
  assert.deepEqual(info.body, { branch: "feat/d", changes: 1, unpushed: 0, only_here: 1, pushed: false, has_remote: false });
  // 変更があると force なしでは消せない。force とブランチを消す指定で、フォルダもブランチも消える
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: wt })).status, 400);
  assert.equal((await call("POST", removeUrl, { path: wt, force: true, delete_branch: true })).status, 200);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(execFileSync("git", ["branch", "--list", "feat/d"], { cwd: repo }).toString().trim(), "");

  // エディタタブの履歴から消したときも、チャットは本体に戻る（ブランチの名前は残す）
  const other = (await call("POST", `/api/projects/${project.id}/chats`, { text: "別の作業", new_worktree_branch: "feat/b" })).body;
  await until(() => store.chats.get(other.id)?.status === "completed");
  assert.equal((await call("POST", `/api/projects/${project.id}/git/worktrees/remove`, { path: other.worktree_path })).status, 200);
  assert.equal(store.chats.get(other.id)?.worktree_path, null);
  assert.equal(store.chats.get(other.id)?.branch, "feat/b");

  // アプリの外でフォルダを消したワークツリー: 続きを送ると分かる文で失敗し、片付けると Git の記録を消してチャットは本体に戻る
  const gone = (await call("POST", `/api/projects/${project.id}/chats`, { text: "消える所", new_worktree_branch: "feat/c" })).body;
  await until(() => store.chats.get(gone.id)?.status === "completed");
  fs.rmSync(gone.worktree_path, { recursive: true, force: true });
  // フォルダが消えた作業場所の Git の操作は 404（「Git で管理されていません」と紛らわしく出さない）
  assert.equal((await call("GET", `/api/projects/${project.id}/git/status?worktree=${encodeURIComponent(gone.worktree_path)}`)).status, 404);
  assert.equal((await call("POST", `/api/chats/${gone.id}/messages`, { text: "続き" })).status, 200);
  await until(() => store.chats.get(gone.id)?.status === "failed");
  assert.match(store.chats.get(gone.id)?.error ?? "", /作業場所のフォルダが見つかりません/);
  assert.equal((await call("POST", removeUrl, { path: gone.worktree_path, delete_branch: true })).status, 200);
  assert.equal(store.chats.get(gone.id)?.worktree_path, null);
  assert.equal(store.chats.get(gone.id)?.branch, "feat/c");
});

test("ブランチ名の案: やりたいことの概要から AI に 1 回だけ聞き、使える形にそろえ、いまあるブランチと同じものを除く（概要がない・案がなければ 400）", async () => {
  const { call, project, provider } = setup();
  const { dir: repo } = gitRepo({ dir: project.repo_path, files: { "a.txt": "a\n" } });
  gitIn(repo)("branch", "feature/login");
  const url = `/api/projects/${project.id}/git/branch-suggestions`;
  provider.askReply = "1. feature/login\n2. `Feature/Login Page`\n- fix/session-timeout";
  const res = await call("POST", url, { summary: "ログイン画面を作る" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { branches: ["feature/login-page", "fix/session-timeout"] });
  // 軽いモデルに、概要といまあるブランチを見せて聞く
  const asked = provider.asked.at(-1);
  assert.equal(asked?.model, "haiku");
  assert.match(asked?.prompt ?? "", /feature\/login/);
  assert.match(asked?.prompt ?? "", /<やりたいこと>\nログイン画面を作る\n<\/やりたいこと>/);
  assert.equal((await call("POST", url, { summary: "  " })).status, 400);
  provider.askReply = "ログイン画面";
  assert.equal((await call("POST", url, { summary: "ログイン画面を作る" })).status, 400);
});
