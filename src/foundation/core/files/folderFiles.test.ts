// フォルダの中のファイルの操作（本物のフォルダで）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { folderFiles, hashOf } from "./folderFiles";

const OUTSIDE = "フォルダの外のファイルです";

/** 中のフォルダ（root）と、その隣の外のフォルダ（outside） */
function setup(opts: { rejectDotNames?: boolean; maxAssetBytes?: number } = {}) {
  const base = tempDir();
  const root = path.join(base, "root");
  const outside = path.join(base, "outside");
  fs.mkdirSync(path.join(root, "sub"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, "a.md"), "a\n");
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret\n");
  const files = folderFiles(root, { outsideMessage: OUTSIDE, maxAssetBytes: opts.maxAssetBytes ?? 1024, rejectDotNames: opts.rejectDotNames });
  return { root, outside, files };
}

test("外を断る: 字面の外・root そのもの・絶対パス・外を指すリンクの先", async () => {
  const { root, outside, files } = setup();
  for (const rel of ["../outside/secret.txt", "", ".", "/etc/hosts", "sub/../../x"]) await assert.rejects(files.inside(rel), new RegExp(OUTSIDE));
  assert.equal(await files.inside("sub/x.md"), path.join(fs.realpathSync(root), "sub/x.md"));
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
  fs.symlinkSync(path.join(root, "a.md"), path.join(root, "inner.md"));
  await assert.rejects(files.read("link.txt"), new RegExp(OUTSIDE));
  await assert.rejects(files.asset("link.txt"), new RegExp(OUTSIDE));
  assert.equal((await files.read("inner.md")).content, "a\n");
  await assert.rejects(files.read("none.md"), /ファイルが見つかりません: none.md/);
  assert.equal(await files.exists("link.txt"), true);
  assert.equal(await files.exists("none.md"), false);
});

test("読む・保存: 指紋が違えば Conflict（null なら確かめない）。NUL があればバイナリ", async () => {
  const { root, files } = setup();
  const first = await files.read("a.md");
  assert.deepEqual(first, { content: "a\n", hash: hashOf(Buffer.from("a\n")), binary: false, truncated: false });
  const saved = await files.write("a.md", "b\n", first.hash);
  assert.equal(saved.hash, hashOf(Buffer.from("b\n")));
  await assert.rejects(files.write("a.md", "c\n", first.hash), /ほかでファイルが変わりました/);
  await files.write("a.md", "c\n", null);
  assert.equal(fs.readFileSync(path.join(root, "a.md"), "utf8"), "c\n");
  fs.writeFileSync(path.join(root, "bin"), Buffer.from([1, 0, 2]));
  assert.deepEqual(await files.read("bin"), { content: "", hash: "", binary: true, truncated: false });
  await assert.rejects(files.read("sub"), /ファイルではありません/);
});

test("作る: 途中のフォルダも作る・同じ名前は Conflict・使えない名前・途中のフォルダのリンクが外を指せば断る", async () => {
  const { root, outside, files } = setup();
  await files.create("new/deep/b.md", { dir: false, content: "b" });
  assert.equal(fs.readFileSync(path.join(root, "new/deep/b.md"), "utf8"), "b");
  await files.create("folder", { dir: true });
  assert.ok(fs.statSync(path.join(root, "folder")).isDirectory());
  await assert.rejects(files.create("a.md", { dir: false }), /「a.md」はもうあります/);
  for (const rel of ["x//y", "../x", "a\\b"]) await assert.rejects(files.create(rel, { dir: false }), /その名前は使えません/);
  fs.symlinkSync(outside, path.join(root, "out"));
  await assert.rejects(files.create("out/c.md", { dir: false }), new RegExp(OUTSIDE));
  await assert.rejects(files.create("out/d/c.md", { dir: false }), new RegExp(OUTSIDE));
  assert.equal(fs.existsSync(path.join(outside, "c.md")), false);
});

test("名前の変更: 同じフォルダの中・大文字小文字だけの変更は許す・同じ名前は Conflict", async () => {
  const { root, files } = setup();
  fs.writeFileSync(path.join(root, "sub/b.md"), "b");
  assert.equal(await files.rename("sub/b.md", "c.md"), "sub/c.md");
  assert.equal(await files.rename("sub/c.md", "C.md"), "sub/C.md");
  assert.deepEqual(fs.readdirSync(path.join(root, "sub")), ["C.md"]);
  assert.equal(await files.rename("a.md", "a.md"), "a.md");
  await assert.rejects(files.rename("a.md", "sub"), /「sub」はもうあります/);
  for (const name of ["", "..", "x/y"]) await assert.rejects(files.rename("a.md", name), /その名前は使えません/);
  await assert.rejects(files.rename("none.md", "x.md"), /ファイルが見つかりません/);
});

test("動かす: 途中のフォルダも作る・その中へは動かさない・行き先に同じ名前は Conflict（大文字小文字だけなら動かす）", async () => {
  const { root, files } = setup();
  await files.move("a.md", "x/y/a.md");
  assert.equal(fs.readFileSync(path.join(root, "x/y/a.md"), "utf8"), "a\n");
  await assert.rejects(files.move("x", "x/y/x"), /その中へは動かせません/);
  fs.writeFileSync(path.join(root, "sub/b.md"), "b");
  await assert.rejects(files.move("sub/b.md", "x/y/a.md"), /行き先に同じ名前の「a.md」があります/);
  await files.move("sub/b.md", "sub/B.md");
  assert.deepEqual(fs.readdirSync(path.join(root, "sub")), ["B.md"]);
  await assert.rejects(files.move("none.md", "z.md"), /ファイルが見つかりません: none.md/);
});

test("動かす: 行き先の途中のフォルダのリンクが外を指せば断る（外へ動かさない）", async () => {
  const { root, outside, files } = setup();
  fs.symlinkSync(outside, path.join(root, "out"));
  await assert.rejects(files.move("a.md", "out/a.md"), new RegExp(OUTSIDE));
  await assert.rejects(files.move("a.md", "out/d/a.md"), new RegExp(OUTSIDE));
  assert.deepEqual(fs.readdirSync(outside), ["secret.txt"]);
  assert.ok(fs.existsSync(path.join(root, "a.md")));
});

test("asset: 上限を超えたら断る・ゴミ箱へは put に任せ、なければ NotFound", async () => {
  const { root, files } = setup({ maxAssetBytes: 4 });
  fs.writeFileSync(path.join(root, "big.css"), "12345");
  await assert.rejects(files.asset("big.css"), /大きすぎます/);
  assert.equal((await files.asset("a.md")).toString(), "a\n");
  await assert.rejects(files.asset("sub"), /ファイルが見つかりません/);
  assert.equal(await files.trash("a.md", async (abs) => abs), path.join(fs.realpathSync(root), "a.md"));
  await assert.rejects(files.trash("none.md", async () => null), /ファイルが見つかりません/);
});

test("「.」の名前: rejectDotNames なら作る・動かす・ゴミ箱へ・名前に使うのを断る（読むのは断らない）", async () => {
  const { root, files } = setup({ rejectDotNames: true });
  fs.writeFileSync(path.join(root, ".hidden.css"), "x");
  for (const run of [
    () => files.create(".x.md", { dir: false }),
    () => files.create("sub/.x/a.md", { dir: false }),
    () => files.move("a.md", ".a.md"),
    () => files.move(".hidden.css", "h.css"),
    () => files.trash(".hidden.css", async () => null),
    () => files.rename("a.md", ".a.md"),
  ]) {
    await assert.rejects(run(), /「.」で始まる名前は使えません/);
  }
  assert.equal((await files.asset(".hidden.css")).toString(), "x");
});
