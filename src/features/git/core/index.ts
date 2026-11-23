// Git の機能のコアの入口（ほかの機能はここだけを読む。中身は分けてある: 状態 status・変更 changes・履歴 history・ブランチ branches・操作の順番 repoLock）
import type { GitStatus } from "@shared/git/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { gitCommonDir } from "@/foundation/core/workplace/reads";
import type { ChatApi } from "@/features/chat/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import { pushBranch } from "./branches";
import { createRepoLock, type RepoLockKind } from "./repoLock";
import { gitRoutes } from "./routes/git";
import { gitStatus } from "./status";
import { openDiffToolGroup } from "./tools";

export { gitRefs } from "./history";

/** 自動のフェッチの間を空ける時間（前の自動のフェッチからこれだけ経っていなければ飛ばす） */
const AUTO_FETCH_MIN_MS = 60_000;

/** ほかの機能が使う Git の口（dir は作業場所のフォルダ） */
export interface GitApi {
  status(dir: string): Promise<GitStatus>;
  /** プッシュする（branch を省けばいまのブランチ。追いかけていなければ origin に同じ名前で公開する） */
  push(dir: string, branch?: string): Promise<void>;
  /** リポジトリの操作の順番の鍵の中で run を動かす（user はフェッチの途中ならその終わりを待つ） */
  withRepoLock<T>(dir: string, kind: RepoLockKind, run: () => Promise<T>): Promise<T>;
}

/** 作業場所の Git（状態・変更・コミット・履歴・ブランチの受け口。ブランチの PR は github の prRoutes.ts） */
export function createGit(k: Kernel, deps: { projects: Pick<ProjectsApi, "param">; chat: Pick<ChatApi, "store"> }): CoreFeature<GitApi> {
  const lock = createRepoLock(k.clock, { autoFetchMinMs: AUTO_FETCH_MIN_MS });
  // 鍵は共通の .git（Git でなければ、そのフォルダ）
  const keyOf = (dir: string) => gitCommonDir(dir).catch(() => dir);
  const api: GitApi = {
    status: gitStatus,
    push: (dir, branch) => pushBranch(dir, k.workplace.git, branch),
    withRepoLock: async (dir, kind, run) => lock.run(await keyOf(dir), kind, run),
  };
  /** 自動のフェッチ（間がない・フェッチの途中・利用者の操作中なら飛ばす。失敗は知らせない） */
  const autoFetch = async (dir: string, run: () => Promise<void>) => {
    const key = await keyOf(dir);
    if (lock.shouldAutoFetch(key)) await lock.run(key, "fetch", run).catch(() => undefined);
  };
  return {
    name: "git",
    api,
    routes: [gitRoutes({ remoteGit: k.workplace.git, projectParam: deps.projects.param, withRepoLock: api.withRepoLock, autoFetch })],
    aiTools: [openDiffToolGroup({ store: deps.chat.store, publish: (e) => k.bus.publish(e) })],
  };
}
