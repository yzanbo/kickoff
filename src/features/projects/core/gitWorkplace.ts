// プロジェクトが Git の作業場所（本体とワークツリー）を持つか。ワークツリーの一覧・作業場所を移す守りが同じ答えを使う
import type { Project } from "@shared/projects/types";
import { isCommonProject } from "@shared/projects/kinds";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";

/**
 * Git の作業場所を持つか（本体のフォルダが Git の作業ツリー）。共通はいつも持たない
 * （作業フォルダ .common-work が Git のリポジトリの中にあると isGitWorkTree は真になるが、そのリポジトリのワークツリーは共通のものではない）
 */
export async function hasGitWorkplace(project: Pick<Project, "kind" | "repo_path">): Promise<boolean> {
  return !isCommonProject(project) && (await isGitWorkTree(project.repo_path));
}
