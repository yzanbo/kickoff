import { gitApi } from "@/features/git/ui/api";
import { workdirInput, type GitTarget } from "@/foundation/ui/api/workdir";

/**
 * 束ねの api（@/foundation/ui/api）から読む Git の口（ほかの機能の github・worktrees が読む分だけ。git の中は ui/api.ts の gitApi を呼ぶ）。
 * 束ねの api をなくすとき（P9 の前）に、読む側を口に替えて消す。作業場所のブランチの PR は github の ui/api/github.ts
 */
export const gitShared = {
  gitStatus: (target: GitTarget) => gitApi("GET /api/projects/:projectId/git/status", workdirInput(target)),
  gitPull: (target: GitTarget) => gitApi("POST /api/projects/:projectId/git/pull", workdirInput(target)),
};
