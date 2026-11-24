// Claude Code の内部の決まり（SDK の型に出ていないもの）を 1 か所に: 環境変数・ファイルの場所・会話記録の行の印・`claude auth status` の形。
// Claude Code の版を上げて動きが変わったら、ここを直す（確かめた版は wire.ts の TESTED_VERSION）
import { homedir } from "node:os";
import { join } from "node:path";

/** Kickoff が読む・渡す Claude Code の環境変数の名前 */
export const CLAUDE_ENV = {
  /** 呼び出し元のアプリの名乗り */
  clientApp: "CLAUDE_AGENT_SDK_CLIENT_APP",
  /** 手が空いたこと（session_state_changed の idle）を知らせてもらう */
  emitSessionState: "CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS",
  /** MCP のツールの待ち時間（ミリ秒） */
  mcpToolTimeout: "MCP_TOOL_TIMEOUT",
  /** Bash などの子プロセスから Anthropic の鍵の環境変数を外す */
  subprocessEnvScrub: "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB",
  /** API キー・トークン（サブスクで動かすときは外す） */
  apiKey: "ANTHROPIC_API_KEY",
  authToken: "ANTHROPIC_AUTH_TOKEN",
  /** 自動の圧縮を始める使用率（%） */
  autoCompactPct: "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  /** 推論の深さの既定 */
  effortLevel: "CLAUDE_CODE_EFFORT_LEVEL",
  /** 設定・会話記録のフォルダ（既定は ~/.claude） */
  configDir: "CLAUDE_CONFIG_DIR",
  /** 実行中のコマンドの出力を書く一時フォルダ */
  tmpDir: "CLAUDE_CODE_TMPDIR",
} as const;

/** 子の Claude Code に足す、自動の圧縮を始める使用率（決めていなければ何も足さない＝ Claude Code の既定） */
export function autoCompactEnv(pct: number | null): Record<string, string> {
  return pct === null ? {} : { [CLAUDE_ENV.autoCompactPct]: String(pct) };
}

/** Claude Code が会話記録を置くフォルダ（CLAUDE_CONFIG_DIR があればその中） */
export const claudeProjectsDir = (env: NodeJS.ProcessEnv = process.env): string => join(env[CLAUDE_ENV.configDir] || join(homedir(), ".claude"), "projects");

/** 推論の深さの既定を探す設定ファイル（近い順: 作業フォルダの .claude/settings.local.json → .claude/settings.json → ~/.claude/settings.json） */
export const claudeSettingsFiles = (cwd: string, home: string) => [
  { file: join(cwd, ".claude", "settings.local.json"), source: "local" as const },
  { file: join(cwd, ".claude", "settings.json"), source: "project" as const },
  { file: join(home, ".claude", "settings.json"), source: "user" as const },
];

/** 実行中のコマンドの出力ファイルを探す場所（Claude Code の一時フォルダの候補。CLAUDE_CODE_TMPDIR → /tmp → OS の一時フォルダ）の下の `claude-<uid>` */
export function commandOutputRoots(tmpdir: string): string[] {
  const name = `claude-${process.getuid?.() ?? 0}`;
  const bases = [process.env[CLAUDE_ENV.tmpDir], "/tmp", tmpdir].filter((d): d is string => Boolean(d));
  return [...new Set(bases.map((d) => join(d, name)))];
}

/** 作業フォルダから、記録を置くフォルダの名前（英数字以外を - に。長いものは Claude Code がハッシュを付けるので、見つからなければ全体を探す） */
export const projectDirName = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** 会話記録のファイルの名前（`<セッション ID>.jsonl`） */
export const SESSION_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** 圧縮の区切りの行 */
export const isBoundary = (line: string) => line.includes('"subtype":"compact_boundary"');

/** ファイルの控えの行（Claude Code が編集の前のファイルを覚えた記録。ファイルを絶対パスで指す） */
export const isFileHistoryLine = (line: string) => line.includes('"type":"file-history-snapshot"') || line.includes('"type":"file-history-delta"');

/** `claude auth status` が出す JSON のうち、Kickoff が読む所 */
export interface ClaudeAuthStatus {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string;
}
