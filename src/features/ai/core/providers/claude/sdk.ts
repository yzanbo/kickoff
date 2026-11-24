// Claude のプロバイダーの差し込み口（外の SDK の口を閉じる 1 ファイル。テストは偽の SDK を渡す）
import { forkSession, getSubagentMessages, query } from "./wire";

/** ClaudeProvider が使う SDK の口（テストでは偽物を渡す） */
export interface ClaudeSdk {
  query: typeof query;
  forkSession: typeof forkSession;
  getSubagentMessages: typeof getSubagentMessages;
}

/** 本物の SDK */
export const realClaudeSdk: ClaudeSdk = { query, forkSession, getSubagentMessages };

/** ClaudeProvider に渡すもの（どれも省ける） */
export interface ClaudeProviderOptions {
  /** SDK の口（省けば本物） */
  sdk?: ClaudeSdk;
  /** Claude Code の実行ファイル（省けば resolveClaudeExecutable()。テストは "claude" などの決まった文字） */
  executable?: string;
}
