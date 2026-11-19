import assert from "node:assert/strict";
import { test } from "vitest";
import { commandEnv, isCodeFile, preCommitChecks, pushesCommits, splitNul } from "./common.mjs";

test("型・knip・テストに関係するファイルだけを、コミット時に確かめる理由にする", () => {
  for (const f of ["src/features/chat/core/a.ts", "src/features/chat/ui/A.tsx", "scripts/x.mjs", "scripts/render-icon.cjs", "package.json", "knip.json"]) assert.equal(isCodeFile(f), true, f);
  for (const f of ["README.md", "CLAUDE.md", "src/app/renderer/styles/app.css", "build/icon.icns", ".githooks/pre-commit"]) assert.equal(isCodeFile(f), false, f);
});

test("コミット時は文書の検査をいつも流し、コードを含むときだけ構造の検査から先を流す", () => {
  const labels = (staged, mobileDeps = true) => preCommitChecks(staged, { mobileDeps }).map(([label]) => label);
  assert.deepEqual(labels(["CLAUDE.md", "docs/architecture.md"]), ["文書"]);
  assert.deepEqual(labels(["src/features/chat/core/a.ts", "README.md"]), ["文書", "構造", "型", "使っていない export・ファイル・依存（knip）", "テストの書き方", "関係するテスト（ファイルごと）"]);
  assert.ok(labels(["mobile/src/a.ts"]).includes("スマホのアプリの型"));
  assert.ok(!labels(["mobile/src/a.ts"], false).includes("スマホのアプリの型"));
  const last = preCommitChecks(["src/features/chat/core/a.ts"], { mobileDeps: false }).at(-1);
  assert.deepEqual(last[2], ["run", "test:changed:isolated", "--silent", "--", "src/features/chat/core/a.ts"]);
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
