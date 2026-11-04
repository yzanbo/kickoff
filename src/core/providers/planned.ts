import type { ProviderId, ProviderStatus } from "@shared/types";
import type { AgentProvider, ProviderTurnResult } from "./types.js";
import { execFileAsync } from "../system/exec.js";

/**
 * まだ Kickoff から使えない（対応予定の）プロバイダー。状態の表示のため、CLI が入っているかだけ確かめる。
 * - Codex: @openai/codex-sdk 経由で `codex` CLI を起動し、`codex login` の認証をそのまま使う想定。
 * - Gemini: `gemini` CLI（Gemini CLI）のログインを使う想定。
 * どちらも Kickoff のツールは MCP サーバーとして渡す。
 */
export class PlannedProvider implements AgentProvider {
  readonly implemented = false;

  constructor(
    readonly id: ProviderId,
    readonly label: string,
    /** CLI のコマンド名 */
    private readonly command: string,
  ) {}

  async status(): Promise<ProviderStatus> {
    const version = await cliVersion(this.command);
    return {
      id: this.id,
      label: this.label,
      implemented: false,
      installed: version !== null,
      loggedIn: false,
      detail: version
        ? `${this.command} CLI（${version}）はインストール済み。Kickoff からの利用は今後対応予定です`
        : `${this.command} CLI は見つかりませんでした。Kickoff からの利用は今後対応予定です`,
    };
  }

  async run(): Promise<ProviderTurnResult> {
    return { status: "failed", sessionId: null, error: `${this.label} はまだ Kickoff から使えません` };
  }
}

/** `<command> --version` の 1 行目（見つからなければ null） */
async function cliVersion(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, ["--version"], { timeout: 5000 });
    return stdout.trim().split("\n")[0]?.slice(0, 60) || "バージョン不明";
  } catch {
    return null;
  }
}
