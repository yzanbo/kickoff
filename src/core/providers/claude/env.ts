import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ProviderAuth } from "../keys.js";

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
 * Agent SDK に同梱される Claude Code の版（SDK の package.json の claudeCodeVersion。読めなければ null）。上げるのは Kickoff の開発の側（package.json の SDK）。
 * SDK は package.json を exports に出していないので、同梱の実行ファイルのパッケージの隣（同じ @anthropic-ai の下）にあるものを読む
 */
export function bundledClaudeVersion(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const platformPkg = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    const sdkPkg = path.join(path.dirname(path.dirname(platformPkg)), "claude-agent-sdk", "package.json");
    const version = (JSON.parse(fs.readFileSync(sdkPkg, "utf8")) as { claudeCodeVersion?: unknown }).claudeCodeVersion;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * API キーで動かすときの環境変数（メモの仕様書「0021」の Q13）。CLAUDE_CODE_SUBPROCESS_ENV_SCRUB で、Claude Code が Bash などの
 * 子プロセスから Anthropic の鍵の環境変数を外す（AI が Bash で読めないように。本物で効くかは使い始める前に確かめる）。サブスクなら何も足さない
 */
export function claudeAuthEnv(auth: ProviderAuth | undefined): Record<string, string> {
  if (auth?.mode !== "api_key" || !auth.apiKey) return {};
  return { ANTHROPIC_API_KEY: auth.apiKey, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1" };
}

/** MCP のツールの待ち時間（7 日。ミリ秒） */
const MCP_TOOL_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Claude のプラン（claude.ai ログイン）で動かすため、API キーの環境変数は子プロセスに渡さない。
 * KICKOFF_ALLOW_API_KEY=1 のときだけ API キー認証を許可する。
 */
export function agentEnv(): Record<string, string | undefined> {
  // 手が空いたこと（session_state_changed の idle）を知らせてもらう（入力を閉じる時を決める。turnOver.ts）
  // MCP のツールの待ち時間は 7 日（コアの MCP サーバーのツールは、承認カードの答えを待つ間は返らないため。フックの待ち時間と同じ）
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "kickoff/0.1.0",
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1",
    MCP_TOOL_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS),
  };
  if (process.env.KICKOFF_ALLOW_API_KEY !== "1") {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  return env;
}
