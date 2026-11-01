import type { Hono } from "hono";
import { z } from "zod";
import { errorMessage } from "../errors.js";
import { FileConflictError, gitDiff, gitStatus, listProjectFiles, readProjectFile, searchProject, writeProjectFile } from "../git.js";
import type { ServerDeps } from "../server.js";
import { HttpError, requireProject } from "./http.js";

const diffQuerySchema = z.object({
  path: z.string().min(1).max(1000),
  old: z.string().min(1).max(1000).optional(),
  staged: z.enum(["0", "1"]).default("0"),
});

/** プロジェクトのフォルダの Git の変更とファイル（ソース管理・エクスプローラー・検索・ファイルの編集） */
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

  // ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き）
  app.put("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const body = z
      .object({ path: z.string().min(1).max(1000), content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() })
      .parse(await c.req.json());
    try {
      return c.json(await writeProjectFile(project.repo_path, body.path, body.content, body.base_hash));
    } catch (e) {
      throw new HttpError(e instanceof FileConflictError ? 409 : 400, errorMessage(e));
    }
  });
}
