// 仮の機能 legacy の受け口: 持ち主の機能より上の機能を使うルートを ServerDeps から登録する（持ち主の機能へ移したら外す）
import type { Hono } from "hono";
import type { CoreFeature } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { projectRoutes } from "@/features/projects/core/routes/projects";
import { uploadRoutes } from "@/features/attachments/core/routes/uploads";
import type { TrashApi } from "@/features/trash/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { NoteService } from "@/features/notes/core/index";

/** ルートが受ける値（ServerDeps に分けた機能の口を足したもの） */
type LegacyRouteDeps = ServerDeps & {
  trashBin: TrashApi;
  prWatch: GitHubApi["prWatch"];
  githubAccounts: GitHubApi["accounts"];
  notes: NoteService;
};

/** 受け口 */
export function legacyRoutes(deps: LegacyRouteDeps): Pick<CoreFeature, "routes"> {
  return { routes: [{ legacy: (app) => registerLegacyRoutes(app, deps) }] };
}

/** プロジェクトと添付の表示の API（パスはほかの機能と重ならないので、前後は問わない） */
function registerLegacyRoutes(app: Hono, deps: LegacyRouteDeps): void {
  projectRoutes(app, deps);
  uploadRoutes(app, deps);
}
