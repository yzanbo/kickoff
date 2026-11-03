import type { Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { addWorktree, finishWorktree, listWorktrees, removeWorktree, worktreePathFor, worktreeRemovalInfo } from "../git.js";
import type { ServerDeps } from "../server.js";
import { badRequest, HttpError, requireProject } from "./http.js";
import { branchName, folderPath } from "./schemas.js";

/** ワークツリー（一覧・作る・消す・PR のあとの片付け。置き場所の案は path?branch= で） */
export function worktreeRoutes(app: Hono, { store, runner }: ServerDeps) {
  app.get("/api/projects/:id/git/worktrees", async (c) => c.json(await listWorktrees(requireProject(store, c.req.param("id")).repo_path)));

  app.get("/api/projects/:id/git/worktrees/path", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { branch } = z.object({ branch: branchName }).parse({ branch: c.req.query("branch") });
    return c.json({ path: await worktreePathFor(project.repo_path, branch) });
  });

  app.post("/api/projects/:id/git/worktrees", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { branch } = z.object({ branch: branchName }).parse(await c.req.json());
    return c.json(await badRequest(() => addWorktree(project.repo_path, branch)), 201);
  });

  /** 作業中のチャットがあるうちは消さない・片付けない（作業中のフォルダが消えてしまう） */
  const assertIdle = (projectId: number, path: string, verb: string) => {
    if (store.runsInWorktree(projectId, path).some((r) => runner.isBusy(r.id))) {
      throw new HttpError(409, `このワークツリーで作業中のチャットがあります。終わってから${verb}てください`);
    }
  };

  // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）
  app.get("/api/projects/:id/git/worktrees/info", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: folderPath }).parse({ path: c.req.query("path") });
    return c.json(await badRequest(() => worktreeRemovalInfo(project.repo_path, path)));
  });

  app.post("/api/projects/:id/git/worktrees/remove", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path, force, deleteBranch } = z
      .object({ path: folderPath, force: z.boolean().default(false), deleteBranch: z.boolean().default(false) })
      .parse(await c.req.json());
    assertIdle(project.id, path, "消し");
    const worktrees = await badRequest(() => removeWorktree(project.repo_path, path, force, deleteBranch));
    // そこで作業していたチャットは、続きを本体で進める（片付けと同じ）
    store.clearRunWorktree(project.id, path);
    return c.json(worktrees);
  });

  // PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す）
  app.post("/api/projects/:id/git/worktrees/finish", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: folderPath }).parse(await c.req.json());
    assertIdle(project.id, path, "片付け");
    try {
      const worktrees = await finishWorktree(project.repo_path, path);
      // そこで作業していたチャットは、続きを本体で進める
      store.clearRunWorktree(project.id, path);
      return c.json(worktrees);
    } catch (e) {
      // ブランチを消すところで失敗しても、ワークツリーが消えていれば、チャットは本体に戻す
      const remaining = await listWorktrees(project.repo_path).catch(() => null);
      if (remaining && !remaining.some((w) => w.path === path)) store.clearRunWorktree(project.id, path);
      throw new HttpError(400, errorMessage(e));
    }
  });
}
