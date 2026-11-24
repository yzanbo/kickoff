// プロジェクトの連携先（GitHub のリポジトリ）を読む口（拡張点 projectGitHubSources。ルートの持ち主の github が 1 つだけ登録する）。
// 履歴のコミットの「GitHub で開く」が読む
import type { ProjectGitHub } from "@shared/git/types";
import { definePoint } from "@/foundation/ui/points";

export interface ProjectGitHubSource {
  projectGitHub(projectId: number): Promise<ProjectGitHub>;
}

export const projectGitHubSources = definePoint<ProjectGitHubSource>("projectGitHubSources");

/** プロジェクトの連携先（登録がなければ null = ボタンを出さない） */
export async function loadProjectGitHub(projectId: number): Promise<ProjectGitHub | null> {
  return (await projectGitHubSources.items()[0]?.projectGitHub(projectId)) ?? null;
}
