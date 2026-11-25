// 本物の使用状況を集める。認証は各 CLI・SDK に任せ、取らないサービスは理由だけを返す
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";
import { fetchClaudeUsage } from "@/features/ai/core/providers/claude/usage";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { CopilotProvider } from "@/features/ai/core/providers/copilot/provider";
import { usageResult } from "@/features/ai/core/providers/shared/usage";

export function realUsageFetchers(providers: Pick<Record<ProviderId, AgentProvider>, "codex" | "copilot">): Record<ProviderId, () => Promise<ProviderUsage>> {
  // チャットが対応予定のときも、使用状況は独立して表示する
  const copilot = providers.copilot.usage ? providers.copilot : new CopilotProvider();
  return {
    claude: () => fetchClaudeUsage(),
    codex: async () => providers.codex.usage?.() ?? usageResult("codex").unavailable("Codex の使用枠を取得できません"),
    copilot: async () => copilot.usage?.() ?? usageResult("copilot").unavailable("Copilot の使用枠を取得できません"),
    cursor: async () => usageResult("cursor").unavailable("Kickoff では Cursor の使用枠を表示しません。Cursor の設定画面または Web のダッシュボードで確認してください。"),
    gemini: async () => usageResult("gemini").unavailable("Kickoff では Gemini の使用枠を表示しません。API キーを作ったプロジェクトの Google AI Studio で確認してください。"),
  };
}
