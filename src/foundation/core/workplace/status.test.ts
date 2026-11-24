import assert from "node:assert/strict";
import { test } from "vitest";
import { parseAheadBehind, parseGitStatus, scopeChanges } from "./status";

test("git status（porcelain v1 -z）を、ステージ済み・未ステージ・競合に分けて読む", () => {
  const raw = [
    "## main...origin/main [ahead 2, behind 1]",
    "M  src/staged.ts",
    " M src/changed.ts",
    "MM src/both.ts",
    "A  src/new.ts",
    " D src/removed.ts",
    "R  src/renamed.ts",
    "src/original.ts",
    "?? notes.md",
    "UU src/conflict.ts",
    "",
  ].join("\0");
  const status = parseGitStatus(raw);
  assert.equal(status.branch, "main");
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.ahead, 2);
  assert.equal(status.behind, 1);
  assert.deepEqual(status.staged, [
    { path: "src/staged.ts", kind: "M" },
    { path: "src/both.ts", kind: "M" },
    { path: "src/new.ts", kind: "A" },
    { path: "src/renamed.ts", old_path: "src/original.ts", kind: "R" },
  ]);
  assert.deepEqual(status.unstaged, [
    { path: "src/changed.ts", kind: "M" },
    { path: "src/both.ts", kind: "M" },
    { path: "src/removed.ts", kind: "D" },
    { path: "notes.md", kind: "U" },
  ]);
  assert.deepEqual(status.conflicts, [{ path: "src/conflict.ts", kind: "!" }]);
});

test("追いかけているブランチとの進み・遅れ（git status の見出しと for-each-ref の upstream:track で同じ読み方）", () => {
  assert.deepEqual(parseAheadBehind("main...origin/main [ahead 2, behind 1]"), { ahead: 2, behind: 1 });
  assert.deepEqual(parseAheadBehind("[behind 3]"), { ahead: 0, behind: 3 });
  assert.deepEqual(parseAheadBehind(""), { ahead: 0, behind: 0 });
});

test("コミット前・ブランチから外れているときのブランチ名", () => {
  assert.equal(parseGitStatus("## No commits yet on main\0").branch, "main");
  assert.equal(parseGitStatus("## HEAD (no branch)\0").branch, null);
  assert.equal(parseGitStatus("## feature/x\0").branch, "feature/x");
  assert.equal(parseGitStatus("## feature/x\0").upstream, null);
});

test("リポジトリの中のフォルダの変更だけを、そのフォルダから見たパスにする（外から名前を変えたものは足したもの）", () => {
  const changes = [
    { path: "app/a.ts", kind: "M" as const },
    { path: "other/b.ts", kind: "M" as const },
    { path: "app/new.ts", old_path: "app/old.ts", kind: "R" as const },
    { path: "app/moved.ts", old_path: "lib/moved.ts", kind: "R" as const },
    { path: "application.ts", kind: "A" as const },
  ];
  assert.deepEqual(scopeChanges(changes, "app"), [
    { path: "a.ts", kind: "M" },
    { path: "new.ts", old_path: "old.ts", kind: "R" },
    { path: "moved.ts", kind: "A" },
  ]);
  assert.equal(scopeChanges(changes, ""), changes);
});
