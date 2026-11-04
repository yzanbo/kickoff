import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { expandHome, isInside, realPathLoose } from "./paths.js";
import { tempDir } from "../testing/tempDir.js";

test("isInside: 中（自身を含む）か外か。'..' で始まる名前のフォルダは外と見なさない", () => {
  const cases: [string, string, boolean][] = [
    ["/repo", "/repo", true],
    ["/repo/", "/repo", true],
    ["/repo", "/repo/src/a.ts", true],
    ["/repo", "/repo/src/../b.ts", true],
    ["/repo", "/repo/..hidden/x", true],
    ["/repo", "/repo/../other", false],
    ["/repo", "/repo/src/../../x", false],
    ["/repo", "/repo-evil/x", false],
    ["/repo", "/other", false],
    ["/repo", "/", false],
    ["/", "/anything/deep", true],
  ];
  for (const [dir, target, expected] of cases) assert.equal(isInside(dir, target), expected, `${dir} の中: ${target}`);
  // 相対パスはいまのフォルダから
  assert.equal(isInside(process.cwd(), "src"), true);
  assert.equal(isInside(process.cwd(), ".."), false);
});

test("expandHome: ~ と ~/ だけをホームフォルダにする", () => {
  const home = os.homedir();
  assert.equal(expandHome("~"), home);
  assert.equal(expandHome("~/Documents"), path.join(home, "Documents"));
  assert.equal(expandHome("~user/x"), "~user/x");
  assert.equal(expandHome("/tmp/~"), "/tmp/~");
  assert.equal(expandHome("docs"), "docs");
});

test("realPathLoose: あるところまでリンクを解決し、まだないファイルは親から組み立てる", () => {
  const root = tempDir({ real: true });
  fs.mkdirSync(path.join(root, "real"));
  fs.symlinkSync(path.join(root, "real"), path.join(root, "link"));
  assert.equal(realPathLoose(path.join(root, "link")), path.join(root, "real"));
  assert.equal(realPathLoose(path.join(root, "link", "new", "file.md")), path.join(root, "real", "new", "file.md"));
  assert.equal(realPathLoose(path.join(root, "missing", "x")), path.join(root, "missing", "x"));
  assert.ok(path.isAbsolute(realPathLoose("relative/none")));
});
