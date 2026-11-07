import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommit, parseGitStatus, parseNameStatus, parseWorktrees, toGitDiff } from "./index.js";
import { parseAheadBehind, scopeChanges } from "./status.js";

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

test("git worktree list --porcelain を読む（最初が本体。ブランチなし・locked・prunable）", () => {
  const out = [
    "worktree /repo\nHEAD aaaa\nbranch refs/heads/main",
    "worktree /repo-worktrees/feature-x\nHEAD bbbb\nbranch refs/heads/feature/x\nlocked",
    "worktree /repo-worktrees/detached\nHEAD cccc\ndetached",
    "worktree /repo-worktrees/gone\nHEAD dddd\nbranch refs/heads/gone\nprunable gitdir file points to non-existent location",
    "",
  ].join("\n\n");
  assert.deepEqual(parseWorktrees(out), [
    { path: "/repo", root: "/repo", branch: "main", head: "aaaa", main: true, locked: false, prunable: false },
    { path: "/repo-worktrees/feature-x", root: "/repo-worktrees/feature-x", branch: "feature/x", head: "bbbb", main: false, locked: true, prunable: false },
    { path: "/repo-worktrees/detached", root: "/repo-worktrees/detached", branch: null, head: "cccc", main: false, locked: false, prunable: false },
    { path: "/repo-worktrees/gone", root: "/repo-worktrees/gone", branch: "gone", head: "dddd", main: false, locked: false, prunable: true },
  ]);
  assert.deepEqual(parseWorktrees(""), []);
});

test("履歴の 1 件を読む（親・ブランチの印は空も可。先頭の改行は読み飛ばす）", () => {
  const cases: [string, ReturnType<typeof parseCommit>][] = [
    [
      ["abc", "p1 p2", "山田", "y@example.com", "2026-01-02T03:04:05+09:00", "HEAD -> main, origin/main", "マージ"].join("\0"),
      { hash: "abc", parents: ["p1", "p2"], author: "山田", email: "y@example.com", date: "2026-01-02T03:04:05+09:00", refs: ["HEAD -> main", "origin/main"], subject: "マージ" },
    ],
    [
      "\n" + ["def", "", "a", "a@example.com", "2026-01-01T00:00:00Z", "", "最初のコミット"].join("\0"),
      { hash: "def", parents: [], author: "a", email: "a@example.com", date: "2026-01-01T00:00:00Z", refs: [], subject: "最初のコミット" },
    ],
  ];
  for (const [record, expected] of cases) assert.deepEqual(parseCommit(record), expected);
});

test("git diff --name-status -z を読む（名前の変更・コピーは元のパスつき。知らない記号は変更）", () => {
  const out = ["M", "src/a.ts", "A", "src/new.ts", "D", "old.txt", "R100", "src/from.ts", "src/to.ts", "C75", "a.md", "b.md", "X", "odd.txt", ""].join("\0");
  assert.deepEqual(parseNameStatus(out), [
    { path: "src/a.ts", kind: "M" },
    { path: "src/new.ts", kind: "A" },
    { path: "old.txt", kind: "D" },
    { old_path: "src/from.ts", path: "src/to.ts", kind: "R" },
    { old_path: "a.md", path: "b.md", kind: "C" },
    { path: "odd.txt", kind: "M" },
  ]);
  assert.deepEqual(parseNameStatus(""), []);
});

test("差分の返し方: バイナリの印と、大きすぎれば途中で切る", () => {
  const text = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y\n";
  assert.deepEqual(toGitDiff(text), { diff: text, binary: false, truncated: false });
  assert.equal(toGitDiff("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n").binary, true);
  assert.equal(toGitDiff("diff --git a/i.png b/i.png\nGIT binary patch\nliteral 10\n").binary, true);
  // 「Binary files」が差分の中身の 1 行（+ 付き）にあるだけなら、バイナリではない
  assert.equal(toGitDiff("+Binary files a and b differ\n").binary, false);
  const huge = "+".repeat(400_001);
  const cut = toGitDiff(huge);
  assert.equal(cut.truncated, true);
  assert.equal(cut.diff.length, 400_000);
  assert.equal(toGitDiff("+".repeat(400_000)).truncated, false);
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
