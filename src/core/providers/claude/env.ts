import { createRequire } from "node:module";
import path from "node:path";

/**
 * Agent SDK に同梱される Claude Code のネイティブバイナリを解決する。
 * パッケージ後の Electron では asar の外（app.asar.unpacked）に展開されている必要がある。
 */
export function resolveClaudeExecutable(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    const bin = path.join(path.dirname(pkg), process.platform === "win32" ? "claude.exe" : "claude");
    return bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  } catch {
    return undefined;
  }
}

/**
 * Claude のプラン（claude.ai ログイン）で動かすため、API キーの環境変数は子プロセスに渡さない。
 * KICKOFF_ALLOW_API_KEY=1 のときだけ API キー認証を許可する。
 */
export function agentEnv(): Record<string, string | undefined> {
  // 手が空いたこと（session_state_changed の idle）を知らせてもらう（入力を閉じる時を決める。turnOver.ts）
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "kickoff/0.1.0", CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" };
  if (process.env.KICKOFF_ALLOW_API_KEY !== "1") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}
