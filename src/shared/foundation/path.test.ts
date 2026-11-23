import assert from "node:assert/strict";
import { test } from "vitest";
import { ancestorsOf, baseName, buildPathTree, expandHomeWith, isUnder, joinPath, parentPath, remapPrefix, topLevelPaths } from "./path";

test("親・名前・つなぐ・中か・親をたどる", () => {
  assert.equal(parentPath("a/b/c.md"), "a/b");
  assert.equal(parentPath("c.md"), null);
  assert.equal(baseName("a/b/c.md"), "c.md");
  assert.equal(baseName("c.md"), "c.md");
  assert.equal(joinPath("a/b", "c.md"), "a/b/c.md");
  assert.equal(joinPath(null, "c.md"), "c.md");
  assert.equal(joinPath("", "c.md"), "c.md");
  assert.equal(isUnder("a/b", "a"), true);
  assert.equal(isUnder("a", "a"), true);
  assert.equal(isUnder("ab/c", "a"), false);
  assert.equal(isUnder("x", ""), true);
  assert.deepEqual(ancestorsOf("a/b/c.md"), ["a", "a/b"]);
  assert.deepEqual(ancestorsOf("c.md"), []);
});

test("動かしたフォルダの下を付け替え、ほかの中にあるものを除く", () => {
  assert.equal(remapPrefix("a/b/c.md", "a/b", "x"), "x/c.md");
  assert.equal(remapPrefix("a/b", "a/b", "x"), "x");
  assert.equal(remapPrefix("a/bc", "a/b", "x"), "a/bc");
  assert.deepEqual(topLevelPaths(["a", "a/b", "ab", "c/d", "c"]), ["a", "ab", "c"]);
});

test("buildPathTree: 途中のフォルダも出し、フォルダを先に名前の順（数は数として）", () => {
  const tree = buildPathTree([
    { path: "b/file10.md", dir: false },
    { path: "b/file2.md", dir: false },
    { path: "a.md", dir: false },
    { path: "empty", dir: true },
    { path: "B.md", dir: false },
  ]);
  const show = (nodes: typeof tree): unknown[] => nodes.map((n) => (n.dir ? { [n.path]: show(n.children) } : n.path));
  assert.deepEqual(show(tree), [{ b: ["b/file2.md", "b/file10.md"] }, { empty: [] }, "a.md", "B.md"]);
});

test("expandHomeWith: ~ と ~/… だけを展開する", () => {
  assert.equal(expandHomeWith("~", "/Users/me"), "/Users/me");
  assert.equal(expandHomeWith("~/.ssh/id", "/Users/me"), "/Users/me/.ssh/id");
  assert.equal(expandHomeWith("~/.ssh/id", "/Users/me/"), "/Users/me/.ssh/id");
  assert.equal(expandHomeWith("/keys/a.pem", "/Users/me"), "/keys/a.pem");
  assert.equal(expandHomeWith("~other/a", "/Users/me"), "~other/a");
});
