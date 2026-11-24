import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maskVolatile } from "./record";

test("maskVolatile: 時刻・UUID・鍵らしい並びを伏せ、ふつうの言葉と数は残す", () => {
  const value = {
    at: "2026-11-19T01:02:03.456Z",
    plain: "2026-11-19T01:02:03Z に作った",
    id: "123e4567-e89b-12d3-a456-426614174000",
    key: "Bearer abcDEF0123456789abcdef0123",
    words: "chat_events_deleted_and_more_words",
    count: 42,
    flag: true,
    none: null,
  };
  assert.deepEqual(maskVolatile(value), {
    at: "<TIME>",
    plain: "<TIME> に作った",
    id: "<UUID>",
    key: "Bearer <KEY>",
    words: "chat_events_deleted_and_more_words",
    count: 42,
    flag: true,
    none: null,
  });
});

test("maskVolatile: 一時フォルダは、その中の最初のフォルダ（毎回違う名前）ごと <TMP> にする。リンクを解いたパスも同じ", () => {
  const made = path.join(os.tmpdir(), "kickoff-test-AbC123", "repo", "a.txt");
  const real = path.join(fs.realpathSync(os.tmpdir()), "kickoff-test-XyZ789", "repo");
  assert.deepEqual(maskVolatile([made, `cd ${real} && ls`, os.tmpdir()]), ["<TMP>/repo/a.txt", "cd <TMP>/repo && ls", "<TMP>"]);
});

test("maskVolatile: paths で渡したパスは名前にする（長いパスから当てる）", () => {
  const repo = "/work/project";
  const worktree = "/work/project-worktrees/feat";
  const out = maskVolatile({ cwd: `${worktree}/src`, repo, nested: [{ p: `${repo}/a` }] }, { paths: { REPO: repo, WT: worktree } });
  assert.deepEqual(out, { cwd: "<WT>/src", repo: "<REPO>", nested: [{ p: "<REPO>/a" }] });
});
