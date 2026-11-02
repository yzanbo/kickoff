import type { Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { commitStaged, discardPaths, FileConflictError, addWorktree, fetchRemote, finishWorktree, gitCommitDetail, pullBranch, gitCommitDiff, gitLog, gitRefs, listWorktrees, removeWorktree, worktreePathFor, pushBranch, gitDiff, gitStatus, listProjectFiles, readProjectFile, searchProject, stagePaths, unstagePaths, writeProjectFile } from "../git.js";
import { createPullRequest, pullRequestFor } from "../github.js";
import type { ServerDeps } from "../server.js";
import { badRequest, gitAction, HttpError, requireProject, requireWorkdir } from "./http.js";
import { branchName, flag, folderPath, queryOf, repoPath } from "./schemas.js";

const diffQuerySchema = z.object({ path: repoPath, old: repoPath.optional(), staged: flag.default("0") });

/** プロジェクトのフォルダの Git の変更とファイル（ソース管理・エクスプローラー・検索・ファイルの編集）。操作するフォルダは requireWorkdir（?worktree=） */
export function gitRoutes(app: Hono, { store, runner }: ServerDeps) {
  app.get("/api/projects/:id/git/status", async (c) => c.json(await gitStatus(await requireWorkdir(c, requireProject(store, c.req.param("id"))))));

  app.get("/api/projects/:id/git/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    const dir = await requireWorkdir(c, project);
    return c.json(await badRequest(() => gitDiff(dir, query.path, query.staged === "1", query.old)));
  });

  app.get("/api/projects/:id/files", async (c) => {
    const files = await listProjectFiles(await requireWorkdir(c, requireProject(store, c.req.param("id"))));
    if (!files) throw new HttpError(400, "このプロジェクトのフォルダは、Git で管理されていません");
    return c.json(files);
  });

  app.get("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    const dir = await requireWorkdir(c, project);
    return c.json(await badRequest(() => readProjectFile(dir, path)));
  });

  app.get("/api/projects/:id/search", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const toggle = flag.default("0").transform((v) => v === "1");
    const query = z
      .object({ q: z.string().max(1000).default(""), case: toggle, word: toggle, regex: toggle })
      .parse({ q: c.req.query("q"), case: c.req.query("case"), word: c.req.query("word"), regex: c.req.query("regex") });
    const dir = await requireWorkdir(c, project);
    try {
      return c.json(await searchProject(dir, { query: query.q, caseSensitive: query.case, wholeWord: query.word, regex: query.regex }));
    } catch {
      throw new HttpError(400, query.regex ? "正規表現の書き方が正しくありません" : "検索できませんでした");
    }
  });

  // ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き）
  app.put("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const body = z.object({ path: repoPath, content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() }).parse(await c.req.json());
    const dir = await requireWorkdir(c, project);
    return c.json(await badRequest(() => writeProjectFile(dir, body.path, body.content, body.base_hash), FileConflictError));
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

  // ワークツリー（一覧・作る・消す。置き場所の案は path?branch= で）
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

  app.post("/api/projects/:id/git/worktrees/remove", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path, force } = z.object({ path: folderPath, force: z.boolean().default(false) }).parse(await c.req.json());
    // 作業中のチャットがあるうちは消さない（作業中のフォルダが消えてしまう）
    if (store.runsInWorktree(project.id, path).some((r) => runner.isBusy(r.id))) {
      throw new HttpError(409, "このワークツリーで作業中のチャットがあります。終わってから消してください");
    }
    const worktrees = await badRequest(() => removeWorktree(project.repo_path, path, force));
    // そこで作業していたチャットは、続きを本体で進める（片付けと同じ）
    store.clearRunWorktree(project.id, path);
    return c.json(worktrees);
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

  // PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す）
  app.post("/api/projects/:id/git/worktrees/finish", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: folderPath }).parse(await c.req.json());
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
