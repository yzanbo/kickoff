import type { Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { gitDiff, gitStatus, listProjectFiles, readProjectFile, searchProject } from "../git.js";
import type { ServerDeps } from "../server.js";
import { HttpError, requireProject } from "./http.js";

const diffQuerySchema = z.object({
  path: z.string().min(1).max(1000),
  old: z.string().min(1).max(1000).optional(),
  staged: z.enum(["0", "1"]).default("0"),
});

/** プロジェクトのフォルダの Git の変更とファイル（ソース管理・エクスプローラーの表示。読むだけ） */
export function gitRoutes(app: Hono, { store }: ServerDeps) {
  app.get("/api/projects/:id/git/status", async (c) => c.json(await gitStatus(requireProject(store, c.req.param("id")).repo_path)));

  app.get("/api/projects/:id/git/diff", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    try {
      return c.json(await gitDiff(project.repo_path, query.path, query.staged === "1", query.old));
    } catch (e) {
      throw new HttpError(400, errorMessage(e));
    }
  });

  app.get("/api/projects/:id/files", async (c) => {
    const files = await listProjectFiles(requireProject(store, c.req.param("id")).repo_path);
    if (!files) throw new HttpError(400, "このプロジェクトのフォルダは、Git で管理されていません");
    return c.json(files);
  });

  app.get("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: z.string().min(1).max(1000) }).parse({ path: c.req.query("path") });
    try {
      return c.json(await readProjectFile(project.repo_path, path));
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
      return c.json(await searchProject(project.repo_path, { query: query.q, caseSensitive: query.case, wholeWord: query.word, regex: query.regex }));
    } catch {
      throw new HttpError(400, query.regex ? "正規表現の書き方が正しくありません" : "検索できませんでした");
    }
  });
}
