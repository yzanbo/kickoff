import type { Hono } from "hono";
import { z } from "zod";
import { listProjectFiles, readProjectFile, renameProjectFile, replaceInProject, searchProject, writeProjectFile } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import type { ProjectReplaceBody } from "@shared/types";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { flag, repoPath } from "./schemas.js";

/** 置換の本文（検索の指定・置換の文・置換する行） */
const replaceBodySchema = z.object({
  query: z.object({
    query: z.string().min(1).max(1000),
    case_sensitive: z.boolean(),
    whole_word: z.boolean(),
    regex: z.boolean(),
    include: z.string().max(2000),
    exclude: z.string().max(2000),
    use_ignore: z.boolean(),
  }),
  replace: z.string().max(10_000),
  preserve_case: z.boolean(),
  files: z.array(z.object({ path: repoPath, lines: z.array(z.object({ line: z.number().int().min(1), text: z.string().max(1000) })).min(1).max(1000) })).min(1).max(5000),
}) satisfies z.ZodType<ProjectReplaceBody>;

/** 作業場所のファイル（エクスプローラーの一覧・中身・検索・置換・保存）。操作するフォルダは withWorkdir（?worktree=）の c.var.workdir */
export function filesRoutes(app: Hono, { store }: ServerDeps) {
  const { withWorkdir } = lookups(store);

  // Git で管理されていなければ 400
  app.get("/api/projects/:id/files", withWorkdir, async (c) => c.json(await listProjectFiles(c.var.workdir)));

  // ファイルの中身（リポジトリの外・外を指すリンクは 400、なければ 404）
  app.get("/api/projects/:id/file", withWorkdir, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await readProjectFile(c.var.workdir, path));
  });

  // ファイルの中を探す（正規表現・含める / 除外するファイルの書き方が正しくなければ 400）。ignore=0 なら .gitignore で無視しているものも探す
  app.get("/api/projects/:id/search", withWorkdir, async (c) => {
    const toggle = (fallback: "0" | "1") => flag.default(fallback).transform((v) => v === "1");
    const globs = z.string().max(2000).default("");
    const query = z
      .object({ q: z.string().max(1000).default(""), case: toggle("0"), word: toggle("0"), regex: toggle("0"), include: globs, exclude: globs, ignore: toggle("1") })
      .parse({ q: queryOf(c, "q"), case: queryOf(c, "case"), word: queryOf(c, "word"), regex: queryOf(c, "regex"), include: queryOf(c, "include"), exclude: queryOf(c, "exclude"), ignore: queryOf(c, "ignore") });
    return c.json(
      await searchProject(c.var.workdir, {
        query: query.q,
        case_sensitive: query.case,
        whole_word: query.word,
        regex: query.regex,
        include: query.include,
        exclude: query.exclude,
        use_ignore: query.ignore,
      }),
    );
  });

  // 探した結果の行を置換する（いまの行が結果の行と違えば、その行は置換しない。置換する前の中身を返すので、画面が元に戻せる）
  app.post("/api/projects/:id/search/replace", withWorkdir, async (c) => {
    const body = replaceBodySchema.parse(await jsonBody(c));
    return c.json(await replaceInProject(c.var.workdir, body));
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
