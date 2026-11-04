import type { Hono } from "hono";
import { z } from "zod";
import { commitStaged, discardPaths, fetchRemote, gitCommitDetail, gitCommitDiff, gitDiff, gitLog, gitRefs, gitStatus, pullBranch, pushBranch, stagePaths, unstagePaths } from "../../git/index.js";
import { createPullRequest, pullRequestFor } from "../../git/github.js";
import type { ServerDeps } from "../server.js";
import { badRequest, gitAction, requireProject, requireWorkdir } from "./http.js";
import { flag, queryOf, repoPath } from "./schemas.js";

const diffQuerySchema = z.object({ path: repoPath, old: repoPath.optional(), staged: flag.default("0") });

/**
 * 作業場所の Git（ソース管理の状態・差分・ステージ・コミット・プッシュ・プル・履歴・PR）。操作するフォルダは requireWorkdir（?worktree=）。
 * ファイルの一覧・中身は routes/files.ts、ワークツリーは routes/worktrees.ts
 */
export function gitRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/projects/:id/git/status", async (c) => c.json(await gitStatus(await requireWorkdir(c, requireProject(store, c.req.param("id"))))));

  app.get("/api/projects/:id/git/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    const dir = await requireWorkdir(c, project);
    return c.json(await badRequest(() => gitDiff(dir, query.path, query.staged === "1", query.old)));
  });

  // ステージ・ステージの取り消し・変更を捨てる（元に戻す）。終わったら新しい状態を返す
  const pathsSchema = z.object({ paths: z.array(repoPath).min(1).max(5000) });
  const actions = { stage: stagePaths, unstage: unstagePaths, discard: discardPaths } as const;
  for (const [name, action] of Object.entries(actions)) {
    app.post(`/api/projects/:id/git/${name}`, async (c) => {
      const project = requireProject(store, c.req.param("id"));
      const { paths } = pathsSchema.parse(await c.req.json());
      const dir = await requireWorkdir(c, project);
      return gitAction(c, dir, () => action(dir, paths));
    });
  }

  // コミット・プッシュ（終わったら新しい状態を返す）
  app.post("/api/projects/:id/git/commit", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { message } = z.object({ message: z.string().max(10_000) }).parse(await c.req.json());
    const dir = await requireWorkdir(c, project);
    return gitAction(c, dir, () => commitStaged(dir, message));
  });

  app.post("/api/projects/:id/git/push", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    return gitAction(c, dir, () => pushBranch(dir));
  });

  // 履歴（読むだけ）
  app.get("/api/projects/:id/git/refs", async (c) => c.json(await gitRefs(await requireWorkdir(c, requireProject(store, c.req.param("id"))))));

  app.get("/api/projects/:id/git/log", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { skip, limit } = z
      .object({ skip: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(200) })
      .parse({ skip: queryOf(c, "skip"), limit: queryOf(c, "limit") });
    return c.json(await gitLog(await requireWorkdir(c, project), skip, limit));
  });

  app.get("/api/projects/:id/git/commits/:hash", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    return c.json(await badRequest(() => gitCommitDetail(dir, c.req.param("hash"))));
  });

  app.get("/api/projects/:id/git/commits/:hash/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = z.object({ path: repoPath, old: repoPath.optional() }).parse({ path: c.req.query("path"), old: c.req.query("old") });
    const dir = await requireWorkdir(c, project);
    return c.json(await badRequest(() => gitCommitDiff(dir, c.req.param("hash"), query.path, query.old)));
  });

  // フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない）
  app.post("/api/projects/:id/git/fetch", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    return gitAction(c, dir, () => fetchRemote(dir));
  });

  // プル（早送りで最新にする）
  app.post("/api/projects/:id/git/pull", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    return gitAction(c, dir, () => pullBranch(dir));
  });

  // 作業場所のブランチの PR（GitHub。gh を使う）。なければ null
  app.get("/api/projects/:id/git/pr", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch || !status.hasOrigin) return c.json(null);
    const branch = status.branch;
    return c.json(await badRequest(() => pullRequestFor(dir, branch)));
  });

  // PR を作る（まだプッシュしていなければ、先にプッシュする）
  app.post("/api/projects/:id/git/pr", async (c) => {
    const dir = await requireWorkdir(c, requireProject(store, c.req.param("id")));
    const pr = await badRequest(async () => {
      const status = await gitStatus(dir);
      if (!status.repo || !status.branch) throw new Error("PR にするブランチがありません");
      if (!status.upstream || status.ahead > 0) await pushBranch(dir);
      return createPullRequest(dir, status.branch);
    });
    return c.json(pr, 201);
  });
}
