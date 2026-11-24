// projects ⇄ git の口: プロジェクトの設定の「プロジェクトフォルダ」が Git から受けるもの（git が contributes.ts で 1 つだけ登録する。登録がなければ Git の案内なし）
import { definePoint } from "@/foundation/ui/points";
import type { WorkplaceRef } from "@/foundation/ui/workplace/workplace";

/** 作業場所が Git で管理されていないか（読み終えるまでは false）と、取り直す口 */
export interface ProjectGitState {
  plain: boolean;
  refresh(): void;
}

export interface ProjectGit {
  useRepo(target: WorkplaceRef): ProjectGitState;
}

const NO_STATE: ProjectGitState = { plain: false, refresh: () => {} };
const NO_GIT: ProjectGit = { useRepo: () => NO_STATE };

export const projectGit = definePoint<ProjectGit>("projectGit", { key: () => "git" });

/** 登録された口（hook の名前にしない。理由は files の filesGit.ts の filesGitImpl） */
const projectGitImpl = (): ProjectGit => projectGit.items()[0] ?? NO_GIT;

export function useProjectGitState(target: WorkplaceRef): ProjectGitState {
  return projectGitImpl().useRepo(target);
}
