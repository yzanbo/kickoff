import type { Hono } from "hono";
import { z } from "zod";
import { listProjectFiles, readProjectFile, searchProject, writeProjectFile } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { requireProject, requireWorkdir } from "./http.js";
import { flag, repoPath, jsonBody } from "./schemas.js";

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・保存）。操作するフォルダは requireWorkdir（?worktree=） */
export function filesRoutes(app: Hono, { store }: ServerDeps) {
  // Git で管理されていなければ 400
  app.get("/api/projects/:id/files", async (c) => c.json(await listProjectFiles(await requireWorkdir(c, requireProject(store, c.req.param("id"))))));

  app.get("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    const dir = await requireWorkdir(c, project);
    return c.json(await readProjectFile(dir, path));
  });

  app.get("/api/projects/:id/search", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const toggle = flag.default("0").transform((v) => v === "1");
    const query = z
      .object({ q: z.string().max(1000).default(""), case: toggle, word: toggle, regex: toggle })
      .parse({ q: c.req.query("q"), case: c.req.query("case"), word: c.req.query("word"), regex: c.req.query("regex") });
    const dir = await requireWorkdir(c, project);
    return c.json(await searchProject(dir, { query: query.q, case_sensitive: query.case, whole_word: query.word, regex: query.regex }));
  });

  // ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き）
  app.put("/api/projects/:id/file", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const body = z.object({ path: repoPath, content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() }).parse(await jsonBody(c));
    const dir = await requireWorkdir(c, project);
    return c.json(await writeProjectFile(dir, body.path, body.content, body.base_hash));
  });
}
