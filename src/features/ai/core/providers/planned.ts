import type { ProviderCliStatus } from "@shared/ai/types";
import type { ProviderId } from "@shared/settings/types";
import type { AgentProvider, ProviderTurnResult } from "./types";
import { runCommand } from "@/foundation/core/system/exec";

/**
 * まだ Kickoff から使えない（対応予定の）プロバイダー。状態の表示のため、CLI が入っているかだけ確かめる。
 * 本物の実装（codex/・copilot/・acp/）は、本物の CLI・アカウントで確かめるまで開発用の環境変数のときだけ使う（index.ts の experimentalProviders）
 */
export class PlannedProvider implements AgentProvider {
  readonly implemented = false;

  constructor(
    readonly id: ProviderId,
    readonly label: string,
    /** CLI のコマンド名 */
    private readonly command: string,
  ) {}

  async status(): Promise<ProviderCliStatus> {
    const version = await cliVersion(this.command);
    return {
      id: this.id,
      label: this.label,
      implemented: false,
      installed: version !== null,
      logged_in: false,
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
    const stdout = await runCommand(command, ["--version"], { timeout: 5000 });
    return stdout.trim().split("\n")[0]?.slice(0, 60) || "バージョン不明";
  } catch {
    return null;
  }
}
