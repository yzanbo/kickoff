import type { Context, Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { commitStaged, discardPaths, FileConflictError, addWorktree, fetchRemote, finishWorktree, gitCommitDetail, pullBranch, gitCommitDiff, gitLog, gitRefs, listWorktrees, removeWorktree, worktreePathFor, pushBranch, gitDiff, gitStatus, listProjectFiles, readProjectFile, searchProject, stagePaths, unstagePaths, writeProjectFile } from "../git.js";
import { createPullRequest, pullRequestFor } from "../github.js";
import type { ServerDeps } from "../server.js";
import { HttpError, requireProject, requireWorkdir } from "./http.js";

const diffQuerySchema = z.object({
  path: z.string().min(1).max(1000),
  old: z.string().min(1).max(1000).optional(),
  staged: z.enum(["0", "1"]).default("0"),
});

/** プロジェクトのフォルダの Git の変更とファイル（ソース管理・エクスプローラー・検索・ファイルの編集） */
export function gitRoutes(app: Hono, { store, runner }: ServerDeps) {
  /**
   * 操作するフォルダ（?worktree= があれば、このプロジェクトのそのワークツリー。なければ本体）。
   * エディタタブで作業場所を切り替えたときに使う
   */
  const workdir = async (c: Context, project = requireProject(store, c.req.param("id") ?? "")): Promise<string> =>
    requireWorkdir(project.repo_path, c.req.query("worktree"));

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
    // 作業中のチャットがあるうちは消さない（作業中のフォルダが消えてしまう）
    if (store.runsInWorktree(project.id, path).some((r) => runner.isBusy(r.id))) {
      throw new HttpError(409, "このワークツリーで作業中のチャットがあります。終わってから消してください");
    }
    try {
      const worktrees = await removeWorktree(project.repo_path, path, force);
      // そこで作業していたチャットは、続きを本体で進める（片付けと同じ）
      store.clearRunWorktree(project.id, path);
      return c.json(worktrees);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  // フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない）
  app.post("/api/projects/:id/git/fetch", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const dir = await workdir(c, project);
    try {
      await fetchRemote(dir);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
    return c.json(await gitStatus(dir));
  });

  // プル（早送りで最新にする）
  app.post("/api/projects/:id/git/pull", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const dir = await workdir(c, project);
    try {
      await pullBranch(dir);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
    return c.json(await gitStatus(dir));
  });

  // 作業場所のブランチの PR（GitHub。gh を使う）。なければ null
  app.get("/api/projects/:id/git/pr", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const dir = await workdir(c, project);
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch || !status.hasOrigin) return c.json(null);
    try {
      return c.json(await pullRequestFor(dir, status.branch));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  // PR を作る（まだプッシュしていなければ、先にプッシュする）
  app.post("/api/projects/:id/git/pr", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const dir = await workdir(c, project);
    try {
      const status = await gitStatus(dir);
      if (!status.repo || !status.branch) throw new Error("PR にするブランチがありません");
      if (!status.upstream || status.ahead > 0) await pushBranch(dir);
      return c.json(await createPullRequest(dir, status.branch), 201);
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  // PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す）
  app.post("/api/projects/:id/git/worktrees/finish", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: z.string().min(1).max(2000) }).parse(await c.req.json());
    // 作業中のチャットがあるうちは片付けない（作業中のフォルダが消えてしまう）
    if (store.runsInWorktree(project.id, path).some((r) => runner.isBusy(r.id))) {
      throw new HttpError(409, "このワークツリーで作業中のチャットがあります。終わってから片付けてください");
    }
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
