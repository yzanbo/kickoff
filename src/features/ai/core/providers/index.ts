import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import { CodexProvider } from "@/features/ai/core/providers/codex/provider";
import { CopilotProvider } from "@/features/ai/core/providers/copilot/provider";
import { cursorProvider } from "@/features/ai/core/providers/cursor/provider";
import { geminiProvider } from "@/features/ai/core/providers/gemini/provider";
import type { ProviderAuth } from "./keys";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { PROVIDERS } from "@shared/ai/providers";
import { ClaudeProvider } from "@/features/ai/core/providers/claude/provider";
import { PlannedProvider } from "./planned";
import type { AgentProvider } from "./types";

export type { AgentProvider } from "./types";

/**
 * 本物の CLI・アカウントで確かめる前の新しい AI を、開発のときだけ使う環境変数（, 区切りの ID。例: KICKOFF_EXPERIMENTAL_PROVIDERS=copilot,cursor）。
 * 確かめるまでは対応予定（PlannedProvider）のままにし、画面で選べない。
 * Codex はサブスクで使うので、いつも本物の実装を使う
 */
export function experimentalProviders(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.KICKOFF_EXPERIMENTAL_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * 利用可能なプロバイダー。新しいプロバイダーはここに追加する。
 * authFor: 実行の外で 1 回だけ聞くとき（名前・要約など）のログインの仕方（設定の API キー）。API キーでしか動かない AI（Gemini）が使う
 */
export function createProviders(self?: SelfInfo, authFor?: (id: ProviderId) => Promise<ProviderAuth>): Record<ProviderId, AgentProvider> {
  const experimental = experimentalProviders();
  return {
    claude: new ClaudeProvider({ self }),
    codex: new CodexProvider(),
    copilot: experimental.has("copilot") ? new CopilotProvider() : new PlannedProvider("copilot", PROVIDER_LABELS.copilot, PROVIDERS.copilot.cli),
    cursor: experimental.has("cursor") ? cursorProvider({ authFor: authFor && (() => authFor("cursor")) }) : new PlannedProvider("cursor", PROVIDER_LABELS.cursor, PROVIDERS.cursor.cli),
    // Gemini は Antigravity CLI を API キーで動かす（定額の枠では使えない）
    gemini: experimental.has("gemini") ? geminiProvider({ authFor: authFor && (() => authFor("gemini")) }) : new PlannedProvider("gemini", PROVIDER_LABELS.gemini, PROVIDERS.gemini.cli),
  };
}
