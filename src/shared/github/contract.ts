// GitHub の取り決め（いまは作業場所のブランチの PR の 2 本。受け口は src/features/github/core/routes/pulls.ts）。
// GitHub タブ・CI・PR の知らせのルートはまだ取り決めの外（P8-2h〜P8-2j で乗せる）
import { route, type Contract, type WorkdirQuery } from "@shared/foundation/contract";
import type { PullRequestInfo } from "@shared/git/types";

/** PR を作る本文（branch があれば、そのブランチをプッシュしてから PR にする。省けばいまのブランチで、まだプッシュしていなければ先にプッシュする） */
export interface CreatePullRequestBody {
  branch?: string;
}

export const githubPrContract = {
  /** 作業場所のブランチの PR（gh を使う。Git でない・ブランチがない・origin がなければ null） */
  "GET /api/projects/:projectId/git/pr": route<never, PullRequestInfo | null, WorkdirQuery>({ workdir: true }),
  /** PR を作る（タイトルと本文はコミットから。この作業場所の issue に結び付いたチャットがあれば Closes を足す） */
  "POST /api/projects/:projectId/git/pr": route<CreatePullRequestBody, PullRequestInfo, WorkdirQuery>({ workdir: true, status: 201 }),
} as const satisfies Contract;
