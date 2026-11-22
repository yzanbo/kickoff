// GitHub と CI の機能のコアの入口（ほかの機能はここだけを読む）
import type { GitHubAccount, ProjectGitHub } from "@shared/git/types";
import type { Project } from "@shared/projects/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatApi } from "@/features/chat/core/index";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import { CiService } from "./ci";
import { activeGhToken, githubEnvForGit, listGitHubAccounts, runAsGitHubAccount } from "./githubAccount";
import { autoGitHubRemote, pickGitHubTarget, readGitHubRemotes } from "./githubTarget";
import { WorktreePrWatch } from "./prWatch";
import { GitHubService } from "./service";
import { ciRoutes } from "./routes/ci";
import { githubRoutes } from "./routes/github";
import { worktreePrRoutes } from "./routes/worktreePrs";
import { createGitHubStores } from "./db/stores";

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

export { createGitHubStores } from "./db/stores";

export interface GitHubApi {
  /** ワークツリーの PR の見張り（マージ・マージせずに閉じたことの知らせ） */
  prWatch: WorktreePrWatch;
}

/** 変えたら PR の見張りを聞き直すプロジェクトの項目 */
const PR_WATCH_KEYS: ReadonlySet<string> = new Set(["github_account", "github_remote", "pr_watch", "ci_watch", "archived"]);

/** GitHub タブと CI の結果（GitHub Actions）・ワークツリーの PR の知らせ（見張りは待ち受けのあとに始める） */
export function createGitHub(k: Kernel, deps: { worktrees: WorktreesApi; projects: ProjectsApi; chat: Pick<ChatApi, "store" | "addTurnContributor">; ai: Pick<AiApi, "provideGhToken"> }, env: GitHubEnv): CoreFeature<GitHubApi> {
  const { bus } = k;
  const stores = createGitHubStores(k.db);
  const store = { ...stores, projects: deps.chat.store.projects, chats: deps.chat.store.chats, groups: deps.chat.store.groups };
  // プロジェクトの頼み（ルート）の中の gh・git は、そのプロジェクトで選んだ GitHub のアカウントで動かす
  k.workplace.projectScopes.add((project, run) => runAsGitHubAccount(project.github_account, run));
  // remote に触る git（Kernel.workplace.git）に、そのプロジェクトのアカウントのトークンを足す（取れなくても手元の操作は止めない）
  k.workplace.gitEnv.register(() => githubEnvForGit());
  // Copilot の使用状況は gh で有効なアカウントのトークンで読む（ai は github より下なので、ここから渡す）
  deps.ai.provideGhToken(activeGhToken);
  // チャットの AI が動かす gh・git も、そのプロジェクトで選んだ GitHub のアカウントにする（環境変数 order 20。gh にそのアカウントがなければ、gh で有効なもののまま）
  deps.chat.addTurnContributor({
    name: "github",
    order: 20,
    contribute: async ({ project }) => (project.github_account ? { env: await runAsGitHubAccount(project.github_account, githubEnvForGit) } : null),
  });
  // PR のブランチのワークツリーを作ったら、実行環境を整える
  const github = new GitHubService({ ...env.service, onWorktreeCreated: (project, worktree) => deps.worktrees.envs.prepare(project, worktree) }, k.workplace.git);
  const ci = new CiService(github, env.ci);
  // ワークツリーの PR の見張り（GitHub でマージされた・閉じられたことを、5 分ごとと窓に戻ったときに確かめる）。
  // CI の失敗の見張りも相乗りする（ワークツリーのないプロジェクトでも。落ちたら SSE の ci_failed）
  const prWatch = new WorktreePrWatch({
    store,
    publish: (e) => bus.publish(e),
    listWorktrees,
    ...env.prWatch,
    alsoCheck: async (project) => {
      for (const failure of await ci.watch(project, stores)) bus.publish({ type: "ci_failed", failure });
    },
  });
  // ワークツリーを消した・戻したら、その PR の知らせ・印を作り直す（GitHub には聞き直さない）
  deps.worktrees.finisher.afterChange(() => prWatch.recomputeAll());
  // プロジェクトの GitHub の連携・アーカイブを変えたら、ワークツリーの PR の見張りをそのプロジェクトだけ聞き直す（待たない）
  deps.projects.afterUpdate((project, changed) => {
    if (changed.some((key) => PR_WATCH_KEYS.has(key))) void prWatch.checkProject(project.id);
  });
  // 設定の「GitHub」: gh に入っているアカウント・GitHub の remote・自動で選ぶ remote・いまの連携先
  const accounts = env.accounts ?? listGitHubAccounts;
  const projectGitHub = async (project: Project): Promise<ProjectGitHub> => {
    const [list, { remotes, ghDefault }] = await Promise.all([accounts(), readGitHubRemotes(project.repo_path)]);
    const auto = autoGitHubRemote(remotes, ghDefault);
    const target = pickGitHubTarget(remotes, ghDefault, project.github_remote);
    return { accounts: list, remotes, auto_remote: auto?.name ?? null, repo: target?.repo ?? null, host: target?.host ?? null };
  };
  return {
    name: "github",
    api: { prWatch },
    routes: [
      {
        legacy: (app) => {
          worktreePrRoutes(app, { store, prWatch });
          githubRoutes(app, { store, github, prWatch, projectGitHub });
          ciRoutes(app, { store, ci });
        },
      },
    ],
    start: () => prWatch.start(),
    stop: () => prWatch.stop(),
  };
}
