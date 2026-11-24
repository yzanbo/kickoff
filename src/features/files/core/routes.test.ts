// API のテスト: ファイル（Git で管理していないフォルダ・一覧・中身と保存・画像と HTML のプレビュー・名前の変更・新しいファイル・ゴミ箱・中の検索と置換）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { AUTH, setup } from "@/app/core/testing/testServer";
import { changedRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("Git で管理していないフォルダでも、ファイルの一覧と検索は使える（.gitignore と node_modules は無視しているものに。フォルダの中に Git の印は作らない）", async () => {
  const { call, api, project } = setup({ features: ["git", "files", "worktrees"] });
  const dir = project.repo_path;
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  write("src/a.ts", "hello world\n");
  write("README.md", "Hello again\n");
  write(".gitignore", "secret.txt\n");
  write("secret.txt", "hello secret\n");
  write("node_modules/pkg/index.js", "hello dep\n");
  write(".DS_Store", "x");
  fs.mkdirSync(path.join(dir, "empty"));
  assert.deepEqual((await api("GET /api/projects/:projectId/git/status", { params: { projectId: project.id } })).body, { repo: false });

  const files = (await api("GET /api/projects/:projectId/files", { params: { projectId: project.id } })).body;
  assert.deepEqual(files.files, [".gitignore", "README.md", "src/a.ts"]);
  assert.deepEqual(files.ignored, [
    { path: ".DS_Store", dir: false },
    { path: "node_modules", dir: true },
    { path: "secret.txt", dir: false },
  ]);
  assert.deepEqual(files.empty_dirs, ["empty"]);
  assert.equal(files.truncated, false);

  const search = async (q: string, opts = "") => (await call("GET", `/api/projects/${project.id}/search?q=${encodeURIComponent(q)}${opts}`)).body;
  const hits = await search("hello");
  assert.deepEqual(
    hits.files.map((f: { path: string }) => f.path),
    ["README.md", "src/a.ts"],
  );
  assert.deepEqual(hits.files[1].matches, [{ line: 1, column: 1, text: "hello world" }]);
  assert.equal((await search("hello", "&case=1")).total, 1);
  // 無視しているものも探す・含めるファイルの指定も効く
  assert.equal((await search("hello", "&ignore=0")).total, 4);
  assert.deepEqual((await search("hello", "&include=src")).files.map((f: { path: string }) => f.path), ["src/a.ts"]);
  // 中身の読み書きは前から Git に依らない
  assert.equal((await api("GET /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "src/a.ts" } })).body.content, "hello world\n");
  assert.equal(fs.existsSync(path.join(dir, ".git")), false);
});

test("ファイルの API（エクスプローラー・中身と保存・画像と HTML のプレビュー・名前の変更・新しいファイル・ゴミ箱）", async () => {
  const ctx = setup({ features: ["git", "files", "worktrees"] });
  const { api, project } = ctx;
  const { dir: repo } = changedRepo(ctx.project.repo_path);
  // エクスプローラー: 管理しているファイル・未追加のファイル。無視しているフォルダは中を開かずに 1 つ
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "x\n");
  const files = (await api("GET /api/projects/:projectId/files", { params: { projectId: project.id } })).body;
  assert.deepEqual(files.files, [".gitignore", "a.txt", "b.txt", "new.txt"]);
  assert.deepEqual(files.ignored, [{ path: "node_modules", dir: true }]);
  assert.equal(files.truncated, false);
  // ファイルの中身（リポジトリの外・外を指すリンクは読ませない）
  const opened = (await api("GET /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "a.txt" } })).body;
  assert.deepEqual({ ...opened, hash: undefined }, { content: "one\ntwo\n", hash: undefined, binary: false, truncated: false });
  assert.match(opened.hash, /^[0-9a-f]{40}$/);
  // 保存: 開いたときの指紋が同じなら書く。ほかで変わっていれば 409 で上書きしない。null なら上書きする
  const saved = await api("PUT /api/projects/:projectId/file", { params: { projectId: project.id }, body: { path: "a.txt", content: "one\nTWO\n", base_hash: opened.hash } });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  const stale = await api("PUT /api/projects/:projectId/file", { params: { projectId: project.id }, body: { path: "a.txt", content: "mine\n", base_hash: opened.hash } });
  assert.equal(stale.status, 409);
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "one\nTWO\n");
  assert.equal((await api("PUT /api/projects/:projectId/file", { params: { projectId: project.id }, body: { path: "a.txt", content: "one\ntwo\n", base_hash: null } })).status, 200);
  assert.equal((await api("PUT /api/projects/:projectId/file", { params: { projectId: project.id }, body: { path: "../outside.txt", content: "x", base_hash: null } })).status, 400);
  assert.equal((await api("GET /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "../outside.txt" } })).status, 400);
  fs.symlinkSync("/etc/hosts", path.join(repo, "link.txt"));
  assert.equal((await api("GET /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "link.txt" } })).status, 400);

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
  const renamed = await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/old.txt", name: "new name.txt" } });
  assert.deepEqual([renamed.status, renamed.body], [200, { path: "dir/new name.txt" }]);
  assert.equal(fs.existsSync(path.join(repo, "dir", "new name.txt")), true);
  assert.equal(fs.existsSync(path.join(repo, "dir", "old.txt")), false);
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/new name.txt", name: "../up.txt" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/new name.txt", name: ".." } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/missing.txt", name: "x.txt" } })).status, 404);
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/new name.txt", name: "NEW NAME.txt" } })).status, 200);
  fs.writeFileSync(path.join(repo, "dir", "other.txt"), "y\n");
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir/other.txt", name: "NEW NAME.txt" } })).status, 409);
  // フォルダの名前も変えられる
  const dir = await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "dir", name: "dir2" } });
  assert.deepEqual(dir.body, { path: "dir2" });
  assert.equal((await api("POST /api/projects/:projectId/file/rename", { params: { projectId: project.id }, body: { path: "../outside.txt", name: "x.txt" } })).status, 400);

  // 新しいファイル・フォルダ: 途中のフォルダも作る。同じ名前は 409、使えない名前・外は 400
  const made = await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "dir2/sub/new.ts" } });
  assert.deepEqual([made.status, made.body], [201, { path: "dir2/sub/new.ts" }]);
  assert.equal(fs.readFileSync(path.join(repo, "dir2", "sub", "new.ts"), "utf8"), "");
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "dir2/sub/new.ts" } })).status, 409);
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "empty", dir: true } })).status, 201);
  assert.equal(fs.statSync(path.join(repo, "empty")).isDirectory(), true);
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "empty/../x.ts" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "../outside.ts" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "a//b.ts" } })).status, 400);
  // リンクで外を指すフォルダの中には作らない
  const outside = tempDir();
  fs.symlinkSync(outside, path.join(repo, "out-link"));
  assert.equal((await api("POST /api/projects/:projectId/files", { params: { projectId: project.id }, body: { path: "out-link/deep/x.ts" } })).status, 400);
  assert.equal(fs.existsSync(path.join(outside, "deep")), false);
  fs.unlinkSync(path.join(repo, "out-link"));
  // 空のフォルダも一覧に出す（中の空のフォルダも）
  fs.mkdirSync(path.join(repo, "empty", "inner"));
  assert.deepEqual((await api("GET /api/projects/:projectId/files", { params: { projectId: project.id } })).body.empty_dirs, ["empty", "empty/inner"]);

  // Kickoff のゴミ箱へ入れる（入れたゴミ箱の ID を返す）。ないものは 404、外は 400
  const trashed = await api("DELETE /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "empty" } });
  assert.equal(trashed.status, 200);
  assert.equal(ctx.store.trash.get(trashed.body.trash_id)?.origin, path.join(fs.realpathSync(repo), "empty"));
  assert.equal(ctx.store.trash.get(trashed.body.trash_id)?.project_id, project.id);
  assert.equal((await api("DELETE /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "empty" } })).status, 404);
  assert.equal((await api("DELETE /api/projects/:projectId/file", { params: { projectId: project.id }, query: { path: "../outside.txt" } })).status, 400);
  assert.deepEqual((await api("GET /api/projects/:projectId/files", { params: { projectId: project.id } })).body.empty_dirs, []);
});

test("ファイルの中の検索と置換（大文字・小文字・単語単位・正規表現・含める / 除外・無視しているファイル）", async () => {
  const ctx = setup({ features: ["git", "files", "worktrees"] });
  const { call, project } = ctx;
  const { dir: repo } = changedRepo(ctx.project.repo_path);
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(repo, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "pkg", "index.js"), "x\n");
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
});
