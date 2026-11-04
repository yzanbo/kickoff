import type { Hono } from "hono";
import { z } from "zod";
import { addWorktree, findWorktree, listWorktrees, removeWorktree, worktreePathFor, worktreeRemovalInfo } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { Conflict } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { branchName, folderPath } from "./schemas.js";

/** ワークツリー（一覧・作る・消す。置き場所の案は path?branch= で）。PR がマージされたあとの片付けは、ブランチも消す（delete_branch）「消す」 */
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

  /** 作業中のチャットがあるうちは消さない（作業中のフォルダが消えてしまう） */
  const assertIdle = (projectId: number, path: string) => {
    if (store.chats.inWorktree(projectId, path).some((r) => runner.isBusy(r.id))) {
      throw new Conflict("このワークツリーで作業中のチャットがあります。終わってから消してください");
    }
  };

  // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）
  app.get("/api/projects/:id/git/worktrees/info", withProject, async (c) => {
    const { path } = z.object({ path: folderPath }).parse({ path: c.req.query("path") });
    return c.json(await worktreeRemovalInfo(c.var.project.repo_path, path));
  });

  /**
   * ワークツリーを消す（force: コミットしていない変更があっても消す。delete_branch: 取り出していたブランチも消す = PR がマージされたあとの片付け）。
   * 消えたら、そこで作業していたチャットの続きを本体で進める（ブランチを消すところで失敗しても、ワークツリーが消えていればチャットは本体に戻す）。
   * 残ったワークツリーの一覧を返す
   */
  app.post("/api/projects/:id/git/worktrees/remove", withProject, async (c) => {
    const { project } = c.var;
    const { path, force, delete_branch } = z
      .object({ path: folderPath, force: z.boolean().default(false), delete_branch: z.boolean().default(false) })
      .parse(await jsonBody(c));
    assertIdle(project.id, path);
    try {
      const worktrees = await removeWorktree(project.repo_path, path, { force, deleteBranch: delete_branch });
      store.chats.clearWorktree(project.id, path);
      return c.json(worktrees);
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない
      const gone = await findWorktree(project.repo_path, path).then((w) => !w, () => false);
      if (gone) store.chats.clearWorktree(project.id, path);
      throw e;
    }
  });
}
