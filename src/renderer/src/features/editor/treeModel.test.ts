import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTree, changeKinds, folderPaths, joinTreePath, newEntryNameError, openableFolders, parentFolders, parentPath, type TreeNode } from "./treeModel";

const names = (nodes: TreeNode[]): unknown => nodes.map((n) => (n.dir ? { [n.name + (n.ignored ? "（無視）" : "")]: names(n.children) } : n.name + (n.ignored ? "（無視）" : "")));

test("パスの一覧から、フォルダを先に名前の順で並べた木を作る（無視しているものも入れる）", () => {
  const tree = buildTree({
    files: ["README.md", "src/b.ts", "src/A.ts", "src/lib/x.ts", ".gitignore", "docs/a.md"],
    ignored: [
      { path: "node_modules", dir: true },
      { path: ".DS_Store", dir: false },
    ],
  });
  assert.deepEqual(names(tree), [
    { docs: ["a.md"] },
    { "node_modules（無視）": [] },
    { src: [{ lib: ["x.ts"] }, "A.ts", "b.ts"] },
    ".DS_Store（無視）",
    ".gitignore",
    "README.md",
  ]);
});

test("空のフォルダも、中のないフォルダとして木に出す（中の空のフォルダも）", () => {
  const tree = buildTree({ files: ["src/a.ts"], ignored: [], empty_dirs: ["empty", "empty/inner", "src/new"] });
  assert.deepEqual(names(tree), [{ empty: [{ inner: [] }] }, { src: [{ new: [] }, "a.ts"] }]);
});

test("すべて開く: 無視しているフォルダとその中は開かない（ほかのフォルダは中のフォルダまで）", () => {
  const tree = buildTree({ files: ["src/lib/x.ts", "docs/a.md"], ignored: [{ path: "node_modules", dir: true }], empty_dirs: ["src/empty"] });
  assert.deepEqual(openableFolders(tree), ["docs", "src", "src/empty", "src/lib"]);
  assert.deepEqual(folderPaths(tree), ["docs", "node_modules", "src", "src/empty", "src/lib"]);
});

test("ファイルは未ステージ・競合を優先し、フォルダには中でいちばん目立つ記号を付ける", () => {
  const { files, folders } = changeKinds({
    repo: true,
    branch: "main",
    upstream: null,
    has_origin: false,
    ahead: 0,
    behind: 0,
    staged: [{ path: "src/a.ts", kind: "A" }],
    unstaged: [
      { path: "src/a.ts", kind: "M" },
      { path: "src/lib/new.ts", kind: "U" },
    ],
    conflicts: [{ path: "docs/x.md", kind: "!" }],
  });
  assert.equal(files.get("src/a.ts"), "M");
  assert.equal(files.get("src/lib/new.ts"), "U");
  assert.equal(folders.get("src"), "M");
  assert.equal(folders.get("src/lib"), "U");
  assert.equal(folders.get("docs"), "!");
});

test("parentFolders: ファイルの上にあるフォルダを近い順に返す（直下のファイルは空）", () => {
  assert.deepEqual(parentFolders("a/b/c.ts"), ["a/b", "a"]);
  assert.deepEqual(parentFolders("README.md"), []);
});

test("新しいファイル・フォルダの名前: 同じ名前・空の段・「..」は断り、「/」で途中のフォルダを書ける", () => {
  const siblings = [
    { name: "src", dir: true },
    { name: "a.ts", dir: false },
  ];
  assert.equal(newEntryNameError(siblings, "b.ts"), null);
  assert.equal(newEntryNameError(siblings, "a.ts"), "「a.ts」はもうあります");
  assert.equal(newEntryNameError(siblings, "src"), "「src」はもうあります");
  // いまあるフォルダの中へは書ける。ファイルの中へは書けない
  assert.equal(newEntryNameError(siblings, "src/new.ts"), null);
  assert.equal(newEntryNameError(siblings, "a.ts/x"), "「a.ts」はもうあります");
  assert.equal(newEntryNameError(siblings, "x//y"), "その名前は使えません");
  assert.equal(newEntryNameError(siblings, "../x"), "その名前は使えません");
  assert.equal(newEntryNameError(siblings, "a\\b"), "「\\」は名前に使えません");
  assert.equal(joinTreePath("", "a.ts"), "a.ts");
  assert.equal(joinTreePath("src", "a.ts"), "src/a.ts");
  assert.equal(parentPath("src/lib/a.ts"), "src/lib");
  assert.equal(parentPath("a.ts"), "");
});
