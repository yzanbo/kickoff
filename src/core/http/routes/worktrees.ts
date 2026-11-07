import path from "node:path";
import type { Hono } from "hono";
import { z } from "zod";
import type { GitWorktree } from "@shared/types";
import { addWorktree, findWorktree, isGitWorkTree, listWorktrees, removeWorktree, worktreePathFor, worktreeRemovalInfo } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { realPathOrSelf } from "../../system/paths.js";
import { Conflict } from "../errors.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { branchName, folderPath } from "./schemas.js";

/** ワークツリー（一覧・作る・消す。置き場所の案は path?branch= で）。PR がマージされたあとの片付けは、ブランチも消す（delete_branch）「消す」 */
export function worktreeRoutes(app: Hono, { store, runner }: ServerDeps) {
  const { withProject } = lookups(store);

  // Git で管理していないフォルダは、ワークツリーのないもの（空）として返す（Git の状態の repo: false と同じ扱い。失敗にすると、画面が取り直し続ける）
  app.get("/api/projects/:id/git/worktrees", withProject, async (c) => {
    const repo = c.var.project.repo_path;
    return c.json((await isGitWorkTree(repo)) ? await listWorktrees(repo) : []);
  });

  app.get("/api/projects/:id/git/worktrees/path", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse({ branch: c.req.query("branch") });
    return c.json({ path: await worktreePathFor(c.var.project.repo_path, branch) });
  });

  app.post("/api/projects/:id/git/worktrees", withProject, async (c) => {
    const { branch } = z.object({ branch: branchName }).parse(await jsonBody(c));
    return c.json(await addWorktree(c.var.project.repo_path, branch), 201);
  });

  /**
   * そのワークツリーを作業場所にしているチャットの持ち主（プロジェクトと、そのプロジェクトから見た作業場所）。
   * 同じリポジトリの中の別のフォルダを本体にしているプロジェクトも、同じワークツリーの中で作業していることがある（ブランチが同じなら使い回す）ので、
   * リポジトリの一番上（本体の root）の下にあるプロジェクトをすべて見る
   */
  const usersOf = (worktree: GitWorktree, list: GitWorktree[]) => {
    const top = list.find((w) => w.main)?.root;
    if (!top) return [];
    // 登録したパスがシンボリックリンクを含むこともある（/var → /private/var）ので、実体で比べる
    return store.projects
      .list()
      .map((p) => ({ id: p.id, real: realPathOrSelf(p.repo_path) }))
      .filter((p) => p.real === top || p.real.startsWith(`${top}/`))
      .map((p) => ({ projectId: p.id, path: path.join(worktree.root, path.relative(top, p.real)) }));
  };

  /** 作業中のチャットがあるうちは消さない（作業中のフォルダが消えてしまう） */
  const assertIdle = (users: { projectId: number; path: string }[]) => {
    if (users.some((u) => store.chats.inWorktree(u.projectId, u.path).some((r) => runner.isBusy(r.id)))) {
      throw new Conflict("このワークツリーで作業中のチャットがあります。終わってから消してください");
    }
  };
  const clearChats = (users: { projectId: number; path: string }[]) => {
    for (const u of users) store.chats.clearWorktree(u.projectId, u.path);
  };

  // 消す前の確かめ（コミットしていない変更・プッシュしていないコミット）
  app.get("/api/projects/:id/git/worktrees/info", withProject, async (c) => {
    const { path: folder } = z.object({ path: folderPath }).parse({ path: c.req.query("path") });
    return c.json(await worktreeRemovalInfo(c.var.project.repo_path, folder));
  });

  /**
   * ワークツリーを消す（force: コミットしていない変更があっても消す。delete_branch: 取り出していたブランチも消す = PR がマージされたあとの片付け）。
   * 消えたら、そこで作業していたチャット（同じリポジトリのほかのプロジェクトのものも）の続きを本体で進める（ブランチを消すところで失敗しても、ワークツリーが消えていればチャットは本体に戻す）。
   * 残ったワークツリーの一覧を返す
   */
  app.post("/api/projects/:id/git/worktrees/remove", withProject, async (c) => {
    const { project } = c.var;
    const { path: folder, force, delete_branch } = z
      .object({ path: folderPath, force: z.boolean().default(false), delete_branch: z.boolean().default(false) })
      .parse(await jsonBody(c));
    const list = await listWorktrees(project.repo_path);
    const target = list.find((w) => w.path === folder);
    const users = target ? usersOf(target, list) : [{ projectId: project.id, path: folder }];
    assertIdle(users);
    try {
      const worktrees = await removeWorktree(project.repo_path, folder, { force, deleteBranch: delete_branch });
      clearChats(users);
      return c.json(worktrees);
    } catch (e) {
      // 一覧も取れなければ、消えたか分からないので戻さない
      const gone = await findWorktree(project.repo_path, folder).then((w) => !w, () => false);
      if (gone) clearChats(users);
      throw e;
    }
  });
}
