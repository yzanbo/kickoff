import type { Context, Hono } from "hono";
import { z } from "zod";
import { commitStaged, discardPaths, fetchRemote, gitCommitDetail, gitCommitDiff, gitDiff, gitLog, gitRefs, gitStatus, pullBranch, pushBranch, stagePaths, unstagePaths } from "../../git/index.js";
import { createPullRequest, pullRequestFor } from "../../git/github.js";
import type { ServerDeps } from "../server.js";
import { Invalid } from "../errors.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { flag, repoPath } from "./schemas.js";

const diffQuerySchema = z.object({ path: repoPath, old: repoPath.optional(), staged: flag.default("0") });

/** Git の操作をしてから、新しい状態を返す（操作の失敗は 400） */
async function gitAction(c: Context, dir: string, action: () => Promise<void>) {
  await action();
  return c.json(await gitStatus(dir));
}

/**
 * 作業場所の Git（ソース管理の状態・差分・ステージ・コミット・プッシュ・プル・履歴・PR）。操作するフォルダは withWorkdir（?worktree=）の c.var.workdir。
 * ファイルの一覧・中身は http/routes/files.ts、ワークツリーは http/routes/worktrees.ts
 */
export function gitRoutes(app: Hono, { store }: ServerDeps) {
  const { withWorkdir } = lookups(store);

  app.get("/api/projects/:id/git/status", withWorkdir, async (c) => c.json(await gitStatus(c.var.workdir)));

  app.get("/api/projects/:id/git/diff", withWorkdir, async (c) => {
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    return c.json(await gitDiff(c.var.workdir, query.path, query.staged === "1", query.old));
  });

  // ステージ・ステージの取り消し・変更を捨てる（元に戻す）。終わったら新しい状態を返す
  const pathsSchema = z.object({ paths: z.array(repoPath).min(1).max(5000) });
  const actions = { stage: stagePaths, unstage: unstagePaths, discard: discardPaths } as const;
  for (const [name, action] of Object.entries(actions)) {
    app.post(`/api/projects/:id/git/${name}`, withWorkdir, async (c) => {
      const { paths } = pathsSchema.parse(await jsonBody(c));
      const dir = c.var.workdir;
      return gitAction(c, dir, () => action(dir, paths));
    });
  }

  // コミット・プッシュ（終わったら新しい状態を返す）
  app.post("/api/projects/:id/git/commit", withWorkdir, async (c) => {
    const { message } = z.object({ message: z.string().max(10_000) }).parse(await jsonBody(c));
    const dir = c.var.workdir;
    return gitAction(c, dir, () => commitStaged(dir, message));
  });

  app.post("/api/projects/:id/git/push", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => pushBranch(c.var.workdir)));

  // 履歴（読むだけ）
  app.get("/api/projects/:id/git/refs", withWorkdir, async (c) => c.json(await gitRefs(c.var.workdir)));

  app.get("/api/projects/:id/git/log", withWorkdir, async (c) => {
    const { skip, limit } = z
      .object({ skip: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(200) })
      .parse({ skip: queryOf(c, "skip"), limit: queryOf(c, "limit") });
    return c.json(await gitLog(c.var.workdir, skip, limit));
  });

  app.get("/api/projects/:id/git/commits/:hash", withWorkdir, async (c) => c.json(await gitCommitDetail(c.var.workdir, c.req.param("hash"))));

  app.get("/api/projects/:id/git/commits/:hash/diff", withWorkdir, async (c) => {
    const query = z.object({ path: repoPath, old: repoPath.optional() }).parse({ path: c.req.query("path"), old: c.req.query("old") });
    return c.json(await gitCommitDiff(c.var.workdir, c.req.param("hash"), query.path, query.old));
  });

  // フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない）
  app.post("/api/projects/:id/git/fetch", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => fetchRemote(c.var.workdir)));

  // プル（早送りで最新にする）
  app.post("/api/projects/:id/git/pull", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => pullBranch(c.var.workdir)));

  // 作業場所のブランチの PR（GitHub。gh を使う）。なければ null
  app.get("/api/projects/:id/git/pr", withWorkdir, async (c) => {
    const dir = c.var.workdir;
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch || !status.has_origin) return c.json(null);
    return c.json(await pullRequestFor(dir, status.branch));
  });

  // PR を作る（まだプッシュしていなければ、先にプッシュする）
  app.post("/api/projects/:id/git/pr", withWorkdir, async (c) => {
    const dir = c.var.workdir;
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch) throw new Invalid("PR にするブランチがありません");
    if (!status.upstream || status.ahead > 0) await pushBranch(dir);
    return c.json(await createPullRequest(dir, status.branch), 201);
  });
}
