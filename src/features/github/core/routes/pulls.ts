// 作業場所のブランチの PR の受け口（取り決め @shared/github/contract.ts。gh を使う。履歴のブランチの「プッシュして PR を作る」もここ）
import { z } from "zod";
import { githubPrContract } from "@shared/github/contract";
import type { Project } from "@shared/projects/types";
import { Invalid } from "@/foundation/core/errors";
import { implement, type Param } from "@/foundation/core/http/implement";
import { workdirQuery } from "@/foundation/core/http/zodParts";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { GitApi } from "@/features/git/core/index";
import { createPullRequest, pullRequestFor } from "@/features/github/core/pulls";
import { resolveGitHubTarget, type GitHubTarget } from "@/features/github/core/target";

/**
 * PR を作るとき閉じる issue: この作業場所（本体なら worktree_path が null）で作業している、アーカイブしていないチャットが結び付いた、連携先の issue の番号
 */
function closingIssues(store: Pick<ChatStoreDeps, "chats">, project: Project, dir: string, target: GitHubTarget | null): number[] {
  if (!target) return [];
  const worktree = dir === project.repo_path ? null : dir;
  return store.chats
    .list({ projectId: project.id })
    .filter((c) => c.worktree_path === worktree && c.github_kind === "issue" && c.github_number !== null && c.github_repo?.toLowerCase() === target.repo.toLowerCase())
    .map((c) => c.github_number!);
}

/** ブランチの名前（「-」で始まる名前は git の側が断る） */
const refName = z.string().trim().min(1).max(255);

export function prRoutes({ store, git, projectParam }: { store: Pick<ChatStoreDeps, "chats">; git: Pick<GitApi, "status" | "push" | "withRepoLock">; projectParam: Param<Project> }) {
  return implement(githubPrContract, {
    context: { projectId: projectParam },
    "GET /api/projects/:projectId/git/pr": {
      query: workdirQuery,
      run: async ({ projectId: project, workdir: dir }) => {
        const status = await git.status(dir);
        if (!status.repo || !status.branch || !status.has_origin) return null;
        return pullRequestFor(dir, status.branch, await resolveGitHubTarget(dir, project.github_remote));
      },
    },
    "POST /api/projects/:projectId/git/pr": {
      query: workdirQuery,
      body: z.object({ branch: refName.optional() }),
      run: async ({ projectId: project, workdir: dir, body }) => {
        let branch = body.branch;
        if (branch) {
          // 指定のブランチをプッシュしてから PR を作る（履歴のブランチの「プッシュして PR を作る」）
          await git.withRepoLock(dir, "user", () => git.push(dir, branch));
        } else {
          // いまのブランチ（まだプッシュしていなければ、先にプッシュする）
          const status = await git.status(dir);
          if (!status.repo || !status.branch) throw new Invalid("PR にするブランチがありません");
          if (!status.upstream || status.ahead > 0) await git.withRepoLock(dir, "user", () => git.push(dir));
          branch = status.branch;
        }
        const target = await resolveGitHubTarget(dir, project.github_remote);
        return createPullRequest(dir, branch, target, closingIssues(store, project, dir, target));
      },
    },
  });
}
