// 仮の機能 legacy の受け口: まだ createX に分けていない機能のルートを、いまの登録の順で ServerDeps から登録する（機能を分けるたびに外す）
import type { Hono } from "hono";
import type { CoreFeature } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { approvalRoutes } from "@/features/chat/core/routes/approvals";
import { chatRoutes } from "@/features/chat/core/routes/chats";
import { sessionRoutes } from "@/features/chat/core/routes/sessions";
import { projectRoutes } from "@/features/projects/core/routes/projects";
import { queueRoutes } from "@/features/chat/core/routes/queue";
import { turnRoutes } from "@/features/chat/core/routes/turns";
import { uploadRoutes } from "@/features/attachments/core/routes/uploads";
import type { TrashApi } from "@/features/trash/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { WorktreeEnvService, WorktreeFinisher } from "@/features/worktrees/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { TerminalSessions } from "@/features/terminal/core/index";
import type { NoteService } from "@/features/notes/core/index";
import type { RemoteImageService } from "@/features/remoteImages/core/index";

/** まだ分けていない機能のルートが受ける値（分けた機能の口を足したもの） */
type LegacyRouteDeps = ServerDeps & {
  trashBin: TrashApi;
  docker: DockerService;
  worktreeEnvs: WorktreeEnvService;
  worktreeFinisher: WorktreeFinisher;
  prWatch: GitHubApi["prWatch"];
  githubAccounts: GitHubApi["accounts"];
  terminals: TerminalSessions;
  notes: NoteService;
  remoteImages: RemoteImageService;
};

/** 受け口（受ける値は登録するときに読む。上の機能の口は legacy のあとに作るため） */
export function legacyRoutes(deps: () => LegacyRouteDeps): Pick<CoreFeature, "routes"> {
  return {
    routes: [
      { legacy: (app) => registerLegacyRoutes(app, deps()) },
    ],
  };
}

/** 機能ごとの API（登録の順は変えない。分けた機能のルートは並べた機能の順で、パスが重ならないので前後は問わない） */
function registerLegacyRoutes(app: Hono, deps: LegacyRouteDeps): void {
  projectRoutes(app, deps);
  chatRoutes(app, deps);
  turnRoutes(app, deps);
  queueRoutes(app, deps);
  sessionRoutes(app, deps);
  uploadRoutes(app, deps);
  approvalRoutes(app, deps);
}
