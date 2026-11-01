import type { Context, Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { commitStaged, discardPaths, FileConflictError, addWorktree, gitCommitDetail, gitCommitDiff, gitLog, gitRefs, listWorktrees, removeWorktree, worktreePathFor, pushBranch, gitDiff, gitStatus, listProjectFiles, readProjectFile, searchProject, stagePaths, unstagePaths, writeProjectFile } from "../git.js";
import type { ServerDeps } from "../server.js";
import { HttpError, requireProject } from "./http.js";

const diffQuerySchema = z.object({
  path: z.string().min(1).max(1000),
  old: z.string().min(1).max(1000).optional(),
  staged: z.enum(["0", "1"]).default("0"),
});

/** プロジェクトのフォルダの Git の変更とファイル（ソース管理・エクスプローラー・検索・ファイルの編集） */
export function gitRoutes(app: Hono, { store }: ServerDeps) {
  /**
   * 操作するフォルダ（?worktree= があれば、このプロジェクトのそのワークツリー。なければ本体）。
   * エディタタブで作業場所を切り替えたときに使う
   */
  const workdir = async (c: Context, project = requireProject(store, c.req.param("id") ?? "")): Promise<string> => {
    const worktree = c.req.query("worktree");
    if (!worktree) return project.repo_path;
    const found = (await listWorktrees(project.repo_path)).find((w) => w.path === worktree);
    if (!found) throw new HttpError(400, "このプロジェクトのワークツリーではありません");
    return found.path;
  };

  app.get("/api/projects/:id/git/status", async (c) => c.json(await gitStatus(await workdir(c))));

  app.get("/api/projects/:id/git/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    try {
      return c.json(await gitDiff(await workdir(c, project), query.path, query.staged === "1", query.old));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  app.get("/api/projects/:id/files", async (c) => {
    const files = await listProjectFiles(await workdir(c));
    if (!files) throw new HttpError(400, "このプロジェクトのフォルダは、Git で管理されていません");
    return c.json(files);
  });

  app.get("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: z.string().min(1).max(1000) }).parse({ path: c.req.query("path") });
    try {
      return c.json(await readProjectFile(await workdir(c, project), path));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  app.get("/api/projects/:id/search", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const flag = z.enum(["0", "1"]).default("0").transform((v) => v === "1");
    const query = z
      .object({ q: z.string().max(1000).default(""), case: flag, word: flag, regex: flag })
      .parse({ q: c.req.query("q"), case: c.req.query("case"), word: c.req.query("word"), regex: c.req.query("regex") });
    try {
      return c.json(await searchProject(await workdir(c, project), { query: query.q, caseSensitive: query.case, wholeWord: query.word, regex: query.regex }));
    } catch {
      throw new HttpError(400, query.regex ? "正規表現の書き方が正しくありません" : "検索できませんでした");
    }
  });

  // ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き）
  app.put("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const body = z
      .object({ path: z.string().min(1).max(1000), content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() })
      .parse(await c.req.json());
    try {
      return c.json(await writeProjectFile(await workdir(c, project), body.path, body.content, body.base_hash));
    } catch (e) {
      throw new HttpError(e instanceof FileConflictError ? 409 : 400, errorMessage(e));
    }
  });

  // ステージ・ステージの取り消し・変更を捨てる（元に戻す）。終わったら新しい状態を返す
  const pathsSchema = z.object({ paths: z.array(z.string().min(1).max(1000)).min(1).max(5000) });
  const actions = { stage: stagePaths, unstage: unstagePaths, discard: discardPaths } as const;
  for (const [name, action] of Object.entries(actions)) {
    app.post(`/api/projects/:id/git/${name}`, async (c) => {
      const project = requireProject(store, c.req.param("id"));
      const { paths } = pathsSchema.parse(await c.req.json());
      try {
        await action(await workdir(c, project), paths);
      } catch (e) {
        throw new HttpError(400, errorMessage(e));
      }
      return c.json(await gitStatus(await workdir(c, project)));
    });
  }

  // コミット・プッシュ（終わったら新しい状態を返す）
  app.post("/api/projects/:id/git/commit", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { message } = z.object({ message: z.string().max(10_000) }).parse(await c.req.json());
    try {
      await commitStaged(await workdir(c, project), message);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
    return c.json(await gitStatus(await workdir(c, project)));
  });

  app.post("/api/projects/:id/git/push", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    try {
      await pushBranch(await workdir(c, project));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
    return c.json(await gitStatus(await workdir(c, project)));
  });

  // 履歴（読むだけ）
  app.get("/api/projects/:id/git/refs", async (c) => c.json(await gitRefs(await workdir(c))));

  app.get("/api/projects/:id/git/log", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { skip, limit } = z
      .object({ skip: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(200) })
      .parse({ skip: c.req.query("skip"), limit: c.req.query("limit") });
    return c.json(await gitLog(await workdir(c, project), skip, limit));
  });

  app.get("/api/projects/:id/git/commits/:hash", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    try {
      return c.json(await gitCommitDetail(await workdir(c, project), c.req.param("hash")));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  app.get("/api/projects/:id/git/commits/:hash/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = z.object({ path: z.string().min(1).max(1000), old: z.string().min(1).max(1000).optional() }).parse({ path: c.req.query("path"), old: c.req.query("old") });
    try {
      return c.json(await gitCommitDiff(await workdir(c, project), c.req.param("hash"), query.path, query.old));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  // ワークツリー（一覧・作る・消す。置き場所の案は path?branch= で）
  app.get("/api/projects/:id/git/worktrees", async (c) => c.json(await listWorktrees(requireProject(store, c.req.param("id")).repo_path)));

  app.get("/api/projects/:id/git/worktrees/path", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { branch } = z.object({ branch: z.string().min(1).max(200) }).parse({ branch: c.req.query("branch") });
    return c.json({ path: await worktreePathFor(project.repo_path, branch) });
  });

  app.post("/api/projects/:id/git/worktrees", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { branch } = z.object({ branch: z.string().trim().min(1).max(200) }).parse(await c.req.json());
    try {
      return c.json(await addWorktree(project.repo_path, branch), 201);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  app.post("/api/projects/:id/git/worktrees/remove", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path, force } = z.object({ path: z.string().min(1).max(2000), force: z.boolean().default(false) }).parse(await c.req.json());
    try {
      return c.json(await removeWorktree(project.repo_path, path, force));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });
}
