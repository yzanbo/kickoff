import type { ProviderAuth } from "@/features/ai/core/providers/keys";
import { CLIENT_INFO, launchEnv } from "@/features/ai/core/providers/shared/process";
import { CLAUDE_ENV } from "./internals";
import { APPROVAL_WAIT_S } from "@/features/ai/core/providers/shared/turnLifecycle";

/**
 * API キーで動かすときの環境変数。CLAUDE_CODE_SUBPROCESS_ENV_SCRUB で、Claude Code が Bash などの
 * 子プロセスから Anthropic の鍵の環境変数を外す（AI が Bash で読めないように。本物で効くかは使い始める前に確かめる）。サブスクなら何も足さない
 */
export function claudeAuthEnv(auth: ProviderAuth | undefined): Record<string, string> {
  if (auth?.mode !== "api_key" || !auth.apiKey) return {};
  return { [CLAUDE_ENV.apiKey]: auth.apiKey, [CLAUDE_ENV.subprocessEnvScrub]: "1" };
}

/** MCP のツールの待ち時間（7 日。ミリ秒） */
const MCP_TOOL_TIMEOUT_MS = APPROVAL_WAIT_S * 1000;

/**
 * Claude のプラン（claude.ai ログイン）で動かすため、API キーの環境変数は子プロセスに渡さない。
 * KICKOFF_ALLOW_API_KEY=1 のときだけ API キー認証を許可する。
 */
export function agentEnv(): Record<string, string | undefined> {
  // 手が空いたこと（session_state_changed の idle）を知らせてもらう（入力を閉じる時を決める。turnOver.ts）
  // MCP のツールの待ち時間は 7 日（コアの MCP サーバーのツールは、承認カードの答えを待つ間は返らないため。フックの待ち時間と同じ）
  return launchEnv(process.env, undefined, {
    drop: process.env.KICKOFF_ALLOW_API_KEY === "1" ? [] : [CLAUDE_ENV.apiKey, CLAUDE_ENV.authToken],
    set: {
      [CLAUDE_ENV.clientApp]: `${CLIENT_INFO.name}/${CLIENT_INFO.version}`,
      [CLAUDE_ENV.emitSessionState]: "1",
      [CLAUDE_ENV.mcpToolTimeout]: String(MCP_TOOL_TIMEOUT_MS),
    },
  });
}
