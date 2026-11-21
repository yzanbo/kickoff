// Git の機能のコアの入口（ほかの機能はここだけを読む。中身は分けてある: 状態 status・ファイル・変更・履歴・ワークツリー）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ChatApi } from "@/features/chat/core/index";
import { gitRoutes } from "./routes/git";
import { openDiffToolGroup } from "./tools";

export { gitStatus, parseGitStatus } from "./status";
export { createProjectFile, listProjectFiles, readProjectAsset, readProjectFile, readProjectImage, renameProjectFile, trashProjectFile, writeProjectFile } from "@/features/files/core/files";
export { replaceInProject, searchProject } from "@/features/files/core/search";
export { commitStaged, discardPaths, fetchRemote, gitDiff, gitOriginal, pullBranch, pushBranch, stagePaths, toGitDiff, unstagePaths } from "./changes";
export { gitBlame } from "./blame";
export { gitCommitDetail, gitCommitDiff, gitLog, gitRefs, parseCommit, parseNameStatus } from "./history";

/** 作業場所の Git（状態・変更・コミット・履歴・ブランチ・PR の受け口） */
export function createGit(k: Kernel, deps: { chat: Pick<ChatApi, "store"> }): CoreFeature<null> {
  return {
    name: "git",
    api: null,
    routes: [{ legacy: (app) => gitRoutes(app, { store: deps.chat.store, remoteGit: k.workplace.git }) }],
    aiTools: [openDiffToolGroup({ store: deps.chat.store, publish: (e) => k.bus.publish(e) })],
  };
}
