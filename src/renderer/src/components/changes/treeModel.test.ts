import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTree, changeKinds, type TreeNode } from "./treeModel";

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

test("ファイルは未ステージ・競合を優先し、フォルダには中でいちばん目立つ記号を付ける", () => {
  const { files, folders } = changeKinds({
    repo: true,
    branch: "main",
    upstream: null,
    hasOrigin: false,
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
