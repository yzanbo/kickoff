// API のテスト: 作業場所のブランチの PR（GET・POST …/git/pr）。gh は PATH に置いた偽物（testing/fakeGh.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { PullRequestInfo } from "@shared/git/types";
import { setup } from "@/app/core/testing/testServer";
import { gitIn, gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { fakeGh } from "@/features/github/core/testing/fakeGh";

const PR = { number: 7, url: "https://github.com/o/r/pull/7", title: "直す", state: "OPEN", isDraft: false };

/** 偽の gh（PR の中身・本文を返す） */
const ghWithPr = () => fakeGh([
  ['"pr view 7 "*"--json body"', '{"body":"本文"}'],
  ['"pr view "*', JSON.stringify(PR)],
]);

/** GitHub の remote（取ってくる側）と、プッシュ先の手元の裸のリポジトリを持つプロジェクト */
function prSetup() {
  const ctx = setup();
  const { dir, git } = gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  const bare = tempDir();
  gitIn(bare)("init", "-q", "--bare");
  git("remote", "add", "origin", "https://github.com/o/r.git");
  git("config", "remote.origin.pushurl", bare);
  return { ...ctx, dir, git, bare, base: `/api/projects/${ctx.project.id}/git/pr` };
}

test("ブランチの PR: origin がなければ null、あれば gh pr view の答え（連携先を --repo で渡す）", async () => {
  const calls = ghWithPr();
  const { call, project, git } = prSetup();
  git("remote", "remove", "origin");
  assert.equal((await call("GET", `/api/projects/${project.id}/git/pr`)).body, null);
  git("remote", "add", "origin", "https://github.com/o/r.git");
  const res = await call("GET", `/api/projects/${project.id}/git/pr`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { number: 7, url: PR.url, title: "直す", state: "OPEN", is_draft: false } satisfies PullRequestInfo);
  assert.deepEqual(calls(), ["pr view main --repo o/r --json number,url,title,state,isDraft"]);
});

test("PR を作る: branch を渡すとそのブランチをプッシュしてから gh pr create、結び付いた issue があれば Closes を足す", async () => {
  const calls = ghWithPr();
  const { call, base, store, project, bare, git } = prSetup();
  git("switch", "-q", "-c", "feature/x");
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "issue のチャット", status: "completed", model: null });
  store.chats.setGitHub(chat.id, { kind: "issue", number: 12, repo: "o/r" });

  const res = await call("POST", base, { branch: "feature/x" });
  assert.equal(res.status, 201);
  assert.equal((res.body as PullRequestInfo).number, 7);
  // プッシュ先にブランチが届き、追いかけるようになった
  assert.match(gitIn(bare)("branch", "--list", "feature/x"), /feature\/x/);
  assert.deepEqual(calls(), [
    "pr create --repo o/r --fill --head feature/x",
    "pr view feature/x --repo o/r --json number,url,title,state,isDraft",
    "pr view 7 --repo o/r --json body",
    "pr edit 7 --repo o/r --body 本文\n\nCloses #12",
  ].flatMap((l) => l.split("\n")));

  // ブランチ名が「-」で始まるものは 400（gh を呼ばない）
  assert.equal((await call("POST", base, { branch: "" })).status, 400);
});
