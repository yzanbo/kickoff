import type { ProviderStatus } from "../types.js";
import type { AgentProvider, ProviderRunResult } from "./types.js";

/**
 * Codex プロバイダー（未実装）。
 * 実装時は @openai/codex-sdk 経由で `codex` CLI を起動し、`codex login` の認証をそのまま使う想定。
 * Kickoff のツールは MCP サーバーとして Codex に渡す。
 */
export class CodexProvider implements AgentProvider {
  readonly id = "codex" as const;
  readonly label = "Codex";
  readonly implemented = false;

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: this.label,
      implemented: false,
      installed: false,
      loggedIn: false,
      detail: "今後対応予定です",
    };
  }

  async run(): Promise<ProviderRunResult> {
    return { status: "failed", sessionId: null, error: "Codex プロバイダーはまだ実装されていません" };
  }
}
