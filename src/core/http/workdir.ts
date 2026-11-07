// Git・ファイル・検索の操作先（作業場所）: ?worktree= のワークツリー、なければプロジェクトの本体。ルートでは lookups の withWorkdir で使う
import fs from "node:fs";
import { findWorktree } from "../git/index.js";
import type { GitWorktree } from "@shared/types";
import { Invalid, NotFound } from "./errors.js";

/**
 * 作業場所の指定（ワークツリーのフォルダ）を、このプロジェクトのワークツリーとして解決する。指定がなければ null（本体）。
 * このプロジェクトのワークツリーでなければ 400、フォルダが消えていれば（アプリの外で消された）404。
 * プロジェクトのフォルダがリポジトリの中のフォルダで、ワークツリーのブランチにそのフォルダがなければ（ブランチを切り替えたなど）、それも 404
 */
export async function requireWorktree(repo: string, worktree: string | undefined): Promise<GitWorktree | null> {
  if (!worktree) return null;
  const found = await findWorktree(repo, worktree);
  if (!found) throw new Invalid("このプロジェクトのワークツリーではありません");
  if (found.prunable) throw new NotFound("作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  if (found.path !== found.root && !fs.existsSync(found.path)) {
    throw new NotFound(`ワークツリー（${found.branch ?? found.root}）に、プロジェクトフォルダがありません（そのブランチにフォルダがまだコミットされていない可能性があります）`);
  }
  return found;
}
