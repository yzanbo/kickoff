// GitHub と CI の機能のコアの入口（ほかの機能はここだけを読む）
import type { GitHubAccount } from "@shared/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { CiService } from "./ci";
import { runAsGitHubAccount } from "./githubAccount";
import { WorktreePrWatch } from "./prWatch";
import { GitHubService } from "./service";
import { ciRoutes } from "./routes/ci";
import { githubRoutes } from "./routes/github";
import { worktreePrRoutes } from "./routes/worktreePrs";

export type { WorktreePrWatch } from "./prWatch";

/** 1 つ目の引数の型（サービスの選択肢） */
type OptionsOf<C extends abstract new (...args: never[]) => unknown> = NonNullable<ConstructorParameters<C>[0]>;

export interface GitHubEnv {
  /** GitHub に聞く口・連携先（テストは偽物） */
  service: Omit<OptionsOf<typeof GitHubService>, "onWorktreeCreated">;
  ci: NonNullable<ConstructorParameters<typeof CiService>[1]>;
  prWatch: Pick<OptionsOf<typeof WorktreePrWatch>, "resolveTarget" | "listPullRequests">;
  /** gh に入っている GitHub のアカウント（設定の「GitHub」。省けば gh auth status） */
  accounts?: () => Promise<GitHubAccount[]>;
}

export interface GitHubApi {
  /** ワークツリーの PR の見張り（マージ・マージせずに閉じたことの知らせ） */
  prWatch: WorktreePrWatch;
  /** gh に入っている GitHub のアカウント（省けば gh auth status） */
  accounts?: () => Promise<GitHubAccount[]>;
}

/** GitHub タブと CI の結果（GitHub Actions）・ワークツリーの PR の知らせ（見張りは待ち受けのあとに始める） */
export function createGitHub(k: KernelWithStore, deps: { worktrees: WorktreesApi }, env: GitHubEnv): CoreFeature<GitHubApi> {
  const { store, bus } = k;
  // プロジェクトの頼み（ルート）の中の gh・git は、そのプロジェクトで選んだ GitHub のアカウントで動かす
  k.workplace.projectScopes.add((project, run) => runAsGitHubAccount(project.github_account, run));
  // PR のブランチのワークツリーを作ったら、実行環境を整える
  const github = new GitHubService({ ...env.service, onWorktreeCreated: (project, worktree) => deps.worktrees.envs.prepare(project, worktree) });
  const ci = new CiService(github, env.ci);
  // ワークツリーの PR の見張り（GitHub でマージされた・閉じられたことを、5 分ごとと窓に戻ったときに確かめる）。
  // CI の失敗の見張りも相乗りする（ワークツリーのないプロジェクトでも。落ちたら SSE の ci_failed）
  const prWatch = new WorktreePrWatch({
    store,
    publish: (e) => bus.publish(e),
    listWorktrees,
    ...env.prWatch,
    alsoCheck: async (project) => {
      for (const failure of await ci.watch(project, store)) bus.publish({ type: "ci_failed", failure });
    },
  });
  // ワークツリーを消した・戻したら、その PR の知らせ・印を作り直す（GitHub には聞き直さない）
  deps.worktrees.finisher.afterChange(() => prWatch.recomputeAll());
  return {
    name: "github",
    api: { prWatch, accounts: env.accounts },
    routes: [
      {
        legacy: (app) => {
          worktreePrRoutes(app, { store, prWatch });
          githubRoutes(app, { store, github, prWatch });
          ciRoutes(app, { store, ci });
        },
      },
    ],
    start: () => prWatch.start(),
    stop: () => prWatch.stop(),
  };
}
