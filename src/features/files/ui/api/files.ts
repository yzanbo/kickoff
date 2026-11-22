import { filesApi } from "@/features/files/ui/api";
import { workdirInput, type GitTarget } from "@/foundation/ui/api/workdir";

/**
 * 束ねの api（@/foundation/ui/api）から読むファイルの口（ほかの機能の composer・chat が読む分だけ。files の中は ui/api.ts の filesApi を呼ぶ）。
 * 束ねの api をなくすとき（P9 の前）に、読む側を口に替えて消す
 */
export const filesShared = {
  projectFiles: (target: GitTarget) => filesApi("GET /api/projects/:projectId/files", workdirInput(target)),
};
