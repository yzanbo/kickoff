import type { Hono } from "hono";
import { z } from "zod";
import { FileConflictError, listProjectFiles, readProjectFile, searchProject, writeProjectFile } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { badRequest, HttpError, requireProject, requireWorkdir } from "./http.js";
import { flag, repoPath } from "./schemas.js";

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・保存）。操作するフォルダは requireWorkdir（?worktree=） */
export function filesRoutes(app: Hono, { store }: ServerDeps) {
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
      return c.json(await searchProject(dir, { query: query.q, case_sensitive: query.case, whole_word: query.word, regex: query.regex }));
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
}
