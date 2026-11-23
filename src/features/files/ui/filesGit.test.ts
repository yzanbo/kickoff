import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { filesGit, filesGitImpl, NO_GIT, useFilesGitStatus } from "./filesGit";

const target = { projectId: 1, worktree: null };

test("filesGit: git を登録しない組み立てでは Git の飾りなし（Git で管理していない・記号なし・差分にしない）", () => {
  useTestContributions([]);
  assert.equal(filesGitImpl(), NO_GIT);
  const Probe = () => {
    const git = useFilesGitStatus(target, true);
    return `${git.repo}:${git.marks.files.size}:${git.changeOf("a.ts")}`;
  };
  assert.equal(renderToString(createElement(Probe)), "false:0:null");
  assert.equal(NO_GIT.tabChange(NO_GIT.useStatus(target, false), { path: "a.ts", staged: false }), null);
  assert.deepEqual(NO_GIT.changeSelection(NO_GIT.useStatus(target, false), { path: "a.ts", staged: true }), { path: "a.ts", staged: true });
});

test("filesGit: 登録した口を使う（1 つだけ）", () => {
  const git = { ...NO_GIT, hasChange: async () => true };
  useTestContributions([filesGit.item(git)]);
  assert.equal(filesGitImpl(), git);
});
