import type { Hono } from "hono";
import { z } from "zod";
import { listProjectFiles, readProjectFile, renameProjectFile, searchProject, writeProjectFile } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { jsonBody } from "../input.js";
import { lookups } from "../lookups.js";
import { flag, repoPath } from "./schemas.js";

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・保存）。操作するフォルダは withWorkdir（?worktree=）の c.var.workdir */
export function filesRoutes(app: Hono, { store }: ServerDeps) {
  const { withWorkdir } = lookups(store);

  // Git で管理されていなければ 400
  app.get("/api/projects/:id/files", withWorkdir, async (c) => c.json(await listProjectFiles(c.var.workdir)));

  // ファイルの中身（リポジトリの外・外を指すリンクは 400、なければ 404）
  app.get("/api/projects/:id/file", withWorkdir, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await readProjectFile(c.var.workdir, path));
  });

  // ファイルの中を探す（正規表現の書き方が正しくなければ 400）
  app.get("/api/projects/:id/search", withWorkdir, async (c) => {
    const toggle = flag.default("0").transform((v) => v === "1");
    const query = z
      .object({ q: z.string().max(1000).default(""), case: toggle, word: toggle, regex: toggle })
      .parse({ q: c.req.query("q"), case: c.req.query("case"), word: c.req.query("word"), regex: c.req.query("regex") });
    return c.json(await searchProject(c.var.workdir, { query: query.q, case_sensitive: query.case, whole_word: query.word, regex: query.regex }));
  });

  // ファイルを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き）
  app.put("/api/projects/:id/file", withWorkdir, async (c) => {
    const body = z.object({ path: repoPath, content: z.string().max(5_000_000), base_hash: z.string().max(100).nullable() }).parse(await jsonBody(c));
    return c.json(await writeProjectFile(c.var.workdir, body.path, body.content, body.base_hash));
  });

  // ファイル・フォルダの名前を変える（同じフォルダの中で。使えない名前・外は 400、ない 404、同じ名前がある 409）
  app.post("/api/projects/:id/file/rename", withWorkdir, async (c) => {
    const body = z.object({ path: repoPath, name: z.string().min(1).max(255) }).parse(await jsonBody(c));
    return c.json(await renameProjectFile(c.var.workdir, body.path, body.name));
  });
}
