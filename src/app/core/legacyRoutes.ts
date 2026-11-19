// 仮の機能 legacy の受け口: まだ createX に分けていない機能のルートを、いまの登録の順で ServerDeps から登録する（機能を分けるたびに外す）
import type { Context, Hono } from "hono";
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/visuals/visualDocument";
import type { CoreFeature } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { approvalRoutes } from "@/features/chat/core/routes/approvals";
import { chatRoutes } from "@/features/chat/core/routes/chats";
import { databaseRoutes } from "@/features/database/core/routes/databases";
import { sessionRoutes } from "@/features/chat/core/routes/sessions";
import { noteRoutes } from "@/features/notes/core/routes/notes";
import { projectRoutes } from "@/features/projects/core/routes/projects";
import { queueRoutes } from "@/features/chat/core/routes/queue";
import { turnRoutes } from "@/features/chat/core/routes/turns";
import { uploadRoutes } from "@/features/attachments/core/routes/uploads";
import { chatImageRoutes } from "@/features/remoteImages/core/routes/chatImages";
import type { TrashApi } from "@/features/trash/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { WorktreeEnvService, WorktreeFinisher } from "@/features/worktrees/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { TerminalSessions } from "@/features/terminal/core/index";

/** まだ分けていない機能のルートが受ける値（分けた機能の口を足したもの） */
type LegacyRouteDeps = ServerDeps & {
  trashBin: TrashApi;
  docker: DockerService;
  worktreeEnvs: WorktreeEnvService;
  worktreeFinisher: WorktreeFinisher;
  prWatch: GitHubApi["prWatch"];
  githubAccounts: GitHubApi["accounts"];
  terminals: TerminalSessions;
};

/** 受け口と、図の枠のページ（受ける値は登録するときに読む。上の機能の口は legacy のあとに作るため） */
export function legacyRoutes(deps: () => LegacyRouteDeps): Pick<CoreFeature, "routes" | "pages"> {
  return {
    routes: [
      { legacy: (app) => registerLegacyRoutes(app, deps()) },
    ],
    pages: { "/visual-frame": visualFrame },
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
  chatImageRoutes(app, deps);
  approvalRoutes(app, deps);
  noteRoutes(app, deps);
  databaseRoutes(app, deps);
}

/**
 * AI が返答に描いた図（SVG・HTML）を入れる枠のページ（認証の外。中身は画面が postMessage で渡すので、秘密は何も持たない）。
 * 画面の CSP を引き継がないよう別のページにし、図だけの CSP（決めた CDN のほかへは通信しない）を見出しで付ける。画面は sandbox="allow-scripts" の iframe で開く
 */
function visualFrame(c: Context) {
  c.header("Content-Security-Policy", VISUAL_FRAME_CSP);
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  return c.html(VISUAL_FRAME_SHELL);
}
