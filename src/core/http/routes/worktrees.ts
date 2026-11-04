import type { Hono } from "hono";
import { z } from "zod";
import { addWorktree, findWorktree, listWorktrees, removeWorktree, worktreePathFor, worktreeRemovalInfo } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import type { Project } from "@shared/types";
import { Conflict } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { branchName, folderPath } from "./schemas.js";

/** ワークツリー（一覧・作る・消す・PR のあとの片付け。置き場所の案は path?branch= で） */
export function worktreeRoutes(app: Hono, { store, runner }: ServerDeps) {
  const { withProject } = lookups(store);

  app.get("/api/projects/:id/git/worktrees", withProject, async (c) => c.json(await listWorktrees(c.var.project.repo_path)));

  app.get("/api/projects/:id/git/worktrees/path", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse({ branch: c.req.query("branch") });
    return c.json({ path: await worktreePathFor(c.var.project.repo_path, branch) });
  });

  app.post("/api/projects/:id/git/worktrees", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse(await jsonBody(c));
    return c.json(await addWorktree(c.var.project.repo_path, branch), 201);
  });

  /** 作業中のチャットがあるうちは消さない・片付けない（作業中のフォルダが消えてしまう） */
  const assertIdle = (projectId: number, path: string, verb: string) => {
    if (store.chats.inWorktree(projectId, path).some((r) => runner.isBusy(r.id))) {
      throw new Conflict(`このワークツリーで作業中のチャットがあります。終わってから${verb}てください`);
    }
  };

  // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）
  app.get("/api/projects/:id/git/worktrees/info", withProject, async (c) => {
    const { path } = z.object({ path: folderPath }).parse({ path: c.req.query("path") });
    return c.json(await worktreeRemovalInfo(c.var.project.repo_path, path));
  });

  /**
   * ワークツリーを消し（deleteBranch ならブランチも）、消えたら、そこで作業していたチャットの続きを本体で進める
   * （ブランチを消すところで失敗しても、ワークツリーが消えていればチャットは本体に戻す）
   */
  const removeAndRelease = async (project: Project, path: string, opts: { force?: boolean; deleteBranch?: boolean }) => {
    try {
      const worktrees = await removeWorktree(project.repo_path, path, opts);
      store.chats.clearWorktree(project.id, path);
      return worktrees;
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない
      const gone = await findWorktree(project.repo_path, path).then((w) => !w, () => false);
      if (gone) store.chats.clearWorktree(project.id, path);
      throw e;
    }
  };

  app.post("/api/projects/:id/git/worktrees/remove", withProject, async (c) => {
    const { project } = c.var;
    const { path, force, deleteBranch } = z
      .object({ path: folderPath, force: z.boolean().default(false), deleteBranch: z.boolean().default(false) })
      .parse(await jsonBody(c));
    assertIdle(project.id, path, "消し");
    return c.json(await removeAndRelease(project, path, { force, deleteBranch }));
  });

  // PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す）
  app.post("/api/projects/:id/git/worktrees/finish", withProject, async (c) => {
    const { project } = c.var;
    const { path } = z.object({ path: folderPath }).parse(await jsonBody(c));
    assertIdle(project.id, path, "片付け");
    return c.json(await removeAndRelease(project, path, { deleteBranch: true }));
  });
}
