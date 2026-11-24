// 本物の使用状況の取り方（各 AI のフォルダの usage.ts。Copilot の gh のトークンは github の機能が ai の口に登録する）
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";
import { fetchClaudeUsage } from "@/features/ai/core/providers/claude/usage";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { fetchCopilotUsage } from "@/features/ai/core/providers/copilot/usage";
import { usageResult } from "@/features/ai/core/providers/shared/http";

export function realUsageFetchers(codex: AgentProvider, ghToken: () => Promise<string | null>): Record<ProviderId, () => Promise<ProviderUsage>> {
  return {
    claude: () => fetchClaudeUsage(),
    codex: async () => codex.usage?.() ?? usageResult("codex").unavailable("Codex の使用枠を取得できません"),
    copilot: () => fetchCopilotUsage(ghToken),
    cursor: async () => usageResult("cursor").unavailable("Kickoff では Cursor の使用枠を表示しません。Cursor の設定画面または Web のダッシュボードで確認してください。"),
    gemini: async () => usageResult("gemini").unavailable("Kickoff では Gemini の使用枠を表示しません。API キーを作ったプロジェクトの Google AI Studio で確認してください。"),
  };
}
