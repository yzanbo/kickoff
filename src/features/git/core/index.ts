// Git の機能のコアの入口（ほかの機能はここだけを読む。中身は分けてある: 状態 status・ファイル・変更・履歴・ワークツリー）
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { gitRoutes } from "./routes/git";

export { currentBranch, gitStatus, isGitWorkTree, parseGitStatus } from "./status";
export { assertInside, createProjectFile, listProjectFiles, readProjectAsset, readProjectFile, readProjectImage, renameProjectFile, trashProjectFile, writeProjectFile } from "@/features/files/core/files";
export { replaceInProject, searchProject } from "@/features/files/core/search";
export { commitStaged, discardPaths, fetchRemote, gitDiff, gitOriginal, pullBranch, pushBranch, stagePaths, toGitDiff, unstagePaths } from "./changes";
export { gitBlame } from "./blame";
export { gitCommitDetail, gitCommitDiff, gitLog, gitRefs, parseCommit, parseNameStatus } from "./history";
export { addWorktree, findWorktree, listWorktrees, newWorktreeProblem, parseWorktrees, removeWorktree, worktreePathFor, worktreeMoves, worktreeRemovalInfo } from "@/foundation/core/workplace/worktrees";

/** 作業場所の Git（状態・変更・コミット・履歴・ブランチ・PR の受け口） */
export function createGit(k: KernelWithStore): CoreFeature<null> {
  return { name: "git", api: null, routes: [{ legacy: (app) => gitRoutes(app, { store: k.store }) }] };
}
