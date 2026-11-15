import assert from "node:assert/strict";
import { test } from "vitest";
import { commandEnv, isCodeFile, pushesCommits, splitNul } from "./common.mjs";

test("型・knip・テストに関係するファイルだけを、コミット時に確かめる理由にする", () => {
  for (const f of ["src/core/a.ts", "src/renderer/src/A.tsx", "scripts/x.mjs", "scripts/render-icon.cjs", "package.json", "knip.json"]) assert.equal(isCodeFile(f), true, f);
  for (const f of ["README.md", "CLAUDE.md", "src/renderer/src/styles/app.css", "build/icon.icns", ".githooks/pre-commit"]) assert.equal(isCodeFile(f), false, f);
});

test("テストに渡す環境変数から、git がフックに付けた GIT_* を外す", () => {
  const env = commandEnv({ PATH: "/bin", HOME: "/Users/a", GIT_INDEX_FILE: "/repo/.git/index", GIT_DIR: "/repo/.git", GITHUB_TOKEN: "t" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/Users/a", GITHUB_TOKEN: "t" });
});

test("消すだけの push では確かめない", () => {
  const zero = "0".repeat(40);
  const sha = "a".repeat(40);
  assert.equal(pushesCommits(`refs/heads/x ${sha} refs/heads/x ${zero}\n`), true);
  assert.equal(pushesCommits(`(delete) ${zero} refs/heads/x ${sha}\n`), false);
  assert.equal(pushesCommits(`(delete) ${zero} refs/heads/x ${sha}\nrefs/heads/y ${sha} refs/heads/y ${sha}\n`), true);
  assert.equal(pushesCommits(""), false);
});

test("git の -z の出力をファイルの一覧に", () => {
  assert.deepEqual(splitNul("a.ts\0dir/b c.ts\0"), ["a.ts", "dir/b c.ts"]);
  assert.deepEqual(splitNul(""), []);
});
