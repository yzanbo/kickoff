// Git・ファイル・検索の操作先（作業場所）: ?worktree= のワークツリー、なければプロジェクトの本体
import { createMiddleware } from "hono/factory";
import { findWorktree } from "../git/index.js";
import type { GitWorktree, Project } from "@shared/types";
import { Invalid, NotFound } from "./errors.js";
import { queryOf } from "./input.js";

/**
 * 作業場所の指定（ワークツリーのフォルダ）を、このプロジェクトのワークツリーとして解決する。指定がなければ null（本体）。
 * このプロジェクトのワークツリーでなければ 400、フォルダが消えていれば（アプリの外で消された）404
 */
export async function requireWorktree(repo: string, worktree: string | undefined): Promise<GitWorktree | null> {
  if (!worktree) return null;
  const found = await findWorktree(repo, worktree);
  if (!found) throw new Invalid("このプロジェクトのワークツリーではありません");
  if (found.prunable) throw new NotFound("作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  return found;
}

/**
 * 操作するフォルダを c.var.workdir に入れるミドルウェア（?worktree= があればそのワークツリー、なければ本体。エディタタブで作業場所を切り替えたとき）。
 * lookups の withProject の後ろに置く
 */
export const withWorkdir = createMiddleware<{ Variables: { project: Project; workdir: string } }>(async (c, next) => {
  const { repo_path } = c.var.project;
  c.set("workdir", (await requireWorktree(repo_path, queryOf(c, "worktree")))?.path ?? repo_path);
  await next();
});
