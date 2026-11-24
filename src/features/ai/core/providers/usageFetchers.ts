// 本物の使用状況の取り方（各 AI のフォルダの usage.ts。Copilot の gh のトークンは github の機能が ai の口に登録する）
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";
import { fetchClaudeUsage } from "@/features/ai/core/providers/claude/usage";
import { fetchCodexUsage } from "@/features/ai/core/providers/codex/usage";
import { fetchCopilotUsage } from "@/features/ai/core/providers/copilot/usage";
import { fetchCursorUsage } from "@/features/ai/core/providers/cursor/usage";
import { fetchGeminiUsage } from "@/features/ai/core/providers/gemini/usage";

export function realUsageFetchers(ghToken: () => Promise<string | null>): Record<ProviderId, () => Promise<ProviderUsage>> {
  return {
    claude: () => fetchClaudeUsage(),
    codex: fetchCodexUsage,
    copilot: () => fetchCopilotUsage(ghToken),
    cursor: fetchCursorUsage,
    gemini: fetchGeminiUsage,
  };
}
