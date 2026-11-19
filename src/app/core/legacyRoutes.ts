// 仮の機能 legacy の受け口: まだ createX に分けていない機能のルートを、いまの登録の順で ServerDeps から登録する（機能を分けるたびに外す）
import type { Context, Hono } from "hono";
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/visuals/visualDocument";
import type { CoreFeature, ServeHooks } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { approvalRoutes } from "@/features/chat/core/routes/approvals";
import { deviceAuth } from "@/features/devices/core/auth";
import { deviceRoutes, pairingClaimRoutes } from "@/features/devices/core/routes/devices";
import { userViewRoutes } from "@/features/userView/core/routes/userView";
import { terminalRoutes } from "@/features/terminal/core/routes/terminals";
import { chatRoutes } from "@/features/chat/core/routes/chats";
import { databaseRoutes } from "@/features/database/core/routes/databases";
import { githubRoutes } from "@/features/github/core/routes/github";
import { ciRoutes } from "@/features/github/core/routes/ci";
import { dockerRoutes } from "@/features/docker/core/routes/docker";
import { portsRoutes } from "@/features/ports/core/routes/ports";
import { filesRoutes } from "@/features/files/core/routes/files";
import { gitRoutes } from "@/features/git/core/routes/git";
import { groupRoutes } from "@/features/groups/core/routes/groups";
import { snippetRoutes } from "@/features/snippets/core/routes/snippets";
import { trashRoutes } from "@/features/trash/core/routes/trash";
import { noteRoutes } from "@/features/notes/core/routes/notes";
import { projectRoutes } from "@/features/projects/core/routes/projects";
import { providerRoutes } from "@/features/ai/core/routes/providers";
import { queueRoutes } from "@/features/chat/core/routes/queue";
import { settingsRoutes } from "@/features/settings/core/routes/settings";
import { turnRoutes } from "@/features/chat/core/routes/turns";
import { uploadRoutes } from "@/features/attachments/core/routes/uploads";
import { chatImageRoutes } from "@/features/remoteImages/core/routes/chatImages";
import { usageRoutes } from "@/features/ai/core/routes/usage";
import { voiceRoutes } from "@/features/voice/core/routes/voice";
import { worktreeRoutes } from "@/features/worktrees/core/routes/worktrees";
import { worktreePrRoutes } from "@/features/github/core/routes/worktreePrs";
import type { McpToolHost } from "@/foundation/core/aiTools/host";

/** 受け口（ペアリングの番号の口は認証の外）と、図の枠のページ */
export function legacyRoutes(deps: ServerDeps): Pick<CoreFeature, "routes" | "pages"> {
  return {
    routes: [
      // スマホ連携のペアリング: まだトークンを持たない端末が、番号で頼んで結果を聞く口（認証の外。routes/devices.ts）
      { access: "public", legacy: (app) => pairingClaimRoutes(app, deps) },
      { legacy: (app) => registerLegacyRoutes(app, deps) },
    ],
    pages: { "/visual-frame": visualFrame },
  };
}

/** HTTP の土台への口（端末の認証・接続の詳細の作業中の数・AI の操作ツールの MCP） */
export function legacyHooks({ store, runner }: Pick<ServerDeps, "store" | "runner">, mcp: McpToolHost): ServeHooks {
  return {
    deviceAuth: deviceAuth(store),
    status: () => ({ remote_enabled: store.settings.get().remote_enabled, agents: runner.stats() }),
    mcp,
  };
}

/** 機能ごとの API（登録の順は変えない） */
function registerLegacyRoutes(app: Hono, deps: ServerDeps): void {
  settingsRoutes(app, deps);
  projectRoutes(app, deps);
  chatRoutes(app, deps);
  turnRoutes(app, deps);
  queueRoutes(app, deps);
  groupRoutes(app, deps);
  snippetRoutes(app, deps);
  trashRoutes(app, deps);
  uploadRoutes(app, deps);
  chatImageRoutes(app, deps);
  approvalRoutes(app, deps);
  providerRoutes(app, deps);
  usageRoutes(app, deps);
  gitRoutes(app, deps);
  filesRoutes(app, deps);
  worktreeRoutes(app, deps);
  worktreePrRoutes(app, deps);
  voiceRoutes(app, deps);
  noteRoutes(app, deps);
  databaseRoutes(app, deps);
  githubRoutes(app, deps);
  ciRoutes(app, deps);
  dockerRoutes(app, deps);
  portsRoutes(app, deps);
  deviceRoutes(app, deps);
  terminalRoutes(app, deps);
  userViewRoutes(app, deps);
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
